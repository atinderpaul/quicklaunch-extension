class QuickLaunchSessions {
  constructor() {
    this.sessions = [];
    this.draggedElement = null;
    this.draggedIndex = null;
    this.expandedSessions = new Set(); 
    this.init();
  }

  async init() {
    await this.loadSessions();
    this.setupEventListeners();
    this.renderSessions();
  }

  async loadSessions() {
    try {
      const result = await chrome.storage.local.get(['sessions']);
      this.sessions = result.sessions || [];
    } catch (error) {
      console.error('Error loading sessions:', error);
      this.sessions = [];
    }
  }

  async saveSessions() {
    try {
      await chrome.storage.local.set({ sessions: this.sessions });
    } catch (error) {
      console.error('Error saving sessions:', error);
    }
  }

  setupEventListeners() {
    document.getElementById('saveCurrentTabs').addEventListener('click', () => {
      this.showSessionNameModal();
    });

    document.getElementById('cancelSave').addEventListener('click', () => {
      this.hideSessionNameModal();
    });

    document.getElementById('confirmSave').addEventListener('click', () => {
      this.saveCurrentSession();
    });

    document.getElementById('sessionNameInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.saveCurrentSession();
      }
    });

    document.getElementById('sessionNameModal').addEventListener('click', (e) => {
      if (e.target.id === 'sessionNameModal') {
        this.hideSessionNameModal();
      }
    });
  }
  showSessionNameModal() {
    const modal = document.getElementById('sessionNameModal');
    const input = document.getElementById('sessionNameInput');
        const now = new Date();
    const defaultName = `Session - ${now.toLocaleDateString()} ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    input.value = defaultName;
    
    modal.classList.add('visible');
    input.focus();
    input.select();
  }
  hideSessionNameModal() {
    const modal = document.getElementById('sessionNameModal');
    modal.classList.remove('visible');
    document.getElementById('sessionNameInput').value = '';
  }
  async saveCurrentSession() {
    const sessionName = document.getElementById('sessionNameInput').value.trim();
    
    if (!sessionName) {
      alert('Please enter a session name');
      return;
    }

    try {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      const sessionTabs = tabs.map(tab => ({
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl
      }));

      const newSession = {
        id: this.generateUniqueId(),
        name: sessionName,
        timestamp: new Date().toISOString(),
        tabs: sessionTabs
      };

      this.sessions.unshift(newSession);
      await this.saveSessions();
      this.renderSessions();
      this.hideSessionNameModal();
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to save session. Please try again.');
    }
  }

  generateUniqueId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  async deleteSession(sessionId) {
    if (!confirm('Are you sure you want to delete this session?')) {
      return;
    }

    this.sessions = this.sessions.filter(session => session.id !== sessionId);
    this.expandedSessions.delete(sessionId); // Remove from expanded set
    await this.saveSessions();
    this.renderSessions();
  }

  async renameSession(sessionId, newName) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session && newName.trim()) {
      session.name = newName.trim();
      await this.saveSessions();
      this.renderSessions();
    }
  }

  async removeTabFromSession(sessionId, tabIndex) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (session && session.tabs.length > tabIndex) {
      session.tabs.splice(tabIndex, 1);
      
      if (session.tabs.length === 0) {
        this.expandedSessions.delete(sessionId);
        await this.deleteSession(sessionId);
      } else {
        await this.saveSessions();
        this.renderSessions();
      }
    }
  }

  async launchSession(sessionId) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session) return;

    try {
      for (const tab of session.tabs) {
        await chrome.tabs.create({ 
          url: tab.url,
          active: false
        });
      }
      window.close(); 
    } catch (error) {
      console.error('Error launching session:', error);
      alert('Failed to launch session. Please try again.');
    }
  }

  async launchSelectedTabs(sessionId, selectedIndices) {
    const session = this.sessions.find(s => s.id === sessionId);
    if (!session || selectedIndices.length === 0) return;

    try {
      for (const index of selectedIndices) {
        if (session.tabs[index]) {
          await chrome.tabs.create({ 
            url: session.tabs[index].url,
            active: false
          });
        }
      }
      window.close(); 
    } catch (error) {
      console.error('Error launching selected tabs:', error);
      alert('Failed to launch selected tabs. Please try again.');
    }
  }

  async openSingleTab(url) {
    try {
      await chrome.tabs.create({ url, active: true });
    } catch (error) {
      console.error('Error opening tab:', error);
    }
  }

  setupDragAndDrop(sessionCard, sessionIndex) {
    const dragHandle = sessionCard.querySelector('.drag-handle');
    
    dragHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.startDrag(sessionCard, sessionIndex, e);
    });

    // Prevent default drag behavior
    sessionCard.addEventListener('dragstart', (e) => {
      e.preventDefault();
    });
    
    // Make drag handle more visible during hover
    dragHandle.addEventListener('mouseenter', () => {
      dragHandle.style.cursor = 'grab';
    });
  }

  startDrag(element, index, e) {
    this.draggedElement = element;
    this.draggedIndex = index;
    
    element.classList.add('dragging');
    
    // Create a clone for visual feedback
    const rect = element.getBoundingClientRect();
    const clone = element.cloneNode(true);
    clone.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      opacity: 0.8;
      pointer-events: none;
      z-index: 1000;
      transform: rotate(2deg);
    `;
    document.body.appendChild(clone);
    this.dragClone = clone;
    
    const mouseMoveHandler = (e) => this.handleDragMove(e);
    const mouseUpHandler = () => this.endDrag(mouseMoveHandler, mouseUpHandler);
    
    document.addEventListener('mousemove', mouseMoveHandler);
    document.addEventListener('mouseup', mouseUpHandler);
  }

  handleDragMove(e) {
    if (!this.draggedElement) return;
    
    // Move the visual clone
    if (this.dragClone) {
      this.dragClone.style.left = `${e.clientX - 200}px`;
      this.dragClone.style.top = `${e.clientY - 30}px`;
    }
    
    const sessionsList = document.getElementById('sessionsList');
    const cards = Array.from(sessionsList.children);
    const afterElement = this.getDragAfterElement(sessionsList, e.clientY);
    
    if (afterElement == null) {
      sessionsList.appendChild(this.draggedElement);
    } else {
      sessionsList.insertBefore(this.draggedElement, afterElement);
    }
  }

  getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.session-card:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  async endDrag(mouseMoveHandler, mouseUpHandler) {
    document.removeEventListener('mousemove', mouseMoveHandler);
    document.removeEventListener('mouseup', mouseUpHandler);
    
    // Remove visual clone
    if (this.dragClone) {
      document.body.removeChild(this.dragClone);
      this.dragClone = null;
    }
    
    if (this.draggedElement) {
      this.draggedElement.classList.remove('dragging');
      
      // Update sessions order
      const sessionsList = document.getElementById('sessionsList');
      const cards = Array.from(sessionsList.children);
      const newOrder = cards.map(card => {
        const sessionId = card.dataset.sessionId;
        return this.sessions.find(s => s.id === sessionId);
      }).filter(Boolean);
      
      this.sessions = newOrder;
      await this.saveSessions();
    }
    
    this.draggedElement = null;
    this.draggedIndex = null;
  }

  // Rendering
  renderSessions() {
    const sessionsList = document.getElementById('sessionsList');
    const emptyState = document.getElementById('emptyState');
    
    if (this.sessions.length === 0) {
      sessionsList.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }
    
    emptyState.style.display = 'none';
    sessionsList.innerHTML = '';
    
    this.sessions.forEach((session, index) => {
      const sessionCard = this.createSessionCard(session, index);
      sessionsList.appendChild(sessionCard);
    });
  }

  createSessionCard(session, index) {
    const card = document.createElement('div');
    card.className = 'session-card';
    card.dataset.sessionId = session.id;
    
    const timestamp = new Date(session.timestamp);
    const formattedTime = timestamp.toLocaleDateString() + ' ' + 
                         timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    const isExpanded = this.expandedSessions.has(session.id);
    
    card.innerHTML = `
      <div class="session-header">
        <div class="drag-handle">≡</div>
        <div class="session-info">
          <div class="session-name" data-session-id="${session.id}">${this.escapeHtml(session.name)}</div>
          <div class="session-timestamp">
            ${formattedTime}
            <span class="tab-count">${session.tabs.length} tabs</span>
          </div>
        </div>
        <div class="session-actions">
          <button class="launch-button" data-session-id="${session.id}">Launch</button>
          <button class="action-button expand-arrow ${isExpanded ? 'expanded' : ''}" data-session-id="${session.id}">${isExpanded ? '⌃' : '⌄'}</button>
          <button class="action-button delete-button" data-session-id="${session.id}" title="Delete session">🗑</button>
        </div>
      </div>
      <div class="session-content ${isExpanded ? 'expanded' : ''}" data-session-id="${session.id}">
        <div class="session-tabs">
          ${this.renderSessionTabs(session)}
        </div>
        <div class="session-controls">
          <div class="selected-count">0 selected</div>
          <button class="launch-selected" data-session-id="${session.id}" disabled>Launch Selected</button>
        </div>
      </div>
    `;
    
    this.setupSessionEventListeners(card, session, index);
    return card;
  }

  get fallbackFaviconDataUrl() {
    // URL-encoded so the value contains no raw quotes/brackets and is safe
    // to embed inside both an HTML attribute and a single-quoted JS string.
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='#e5e7eb'/></svg>";
    // encodeURIComponent leaves ' unescaped, so escape it separately to keep
    // the result safe inside a single-quoted JS string too.
    return `data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}`;
  }

  renderSessionTabs(session) {
    return session.tabs.map((tab, index) => `
      <div class="session-tab">
        <input type="checkbox" class="tab-checkbox" data-tab-index="${index}">
        <img class="tab-favicon" src="${tab.favIconUrl ? this.escapeHtml(tab.favIconUrl) : this.fallbackFaviconDataUrl}"
             onerror="this.onerror=null;this.src='${this.fallbackFaviconDataUrl}'"
             alt="">
        <a href="#" class="tab-title" data-url="${this.escapeHtml(tab.url)}">${this.escapeHtml(tab.title)}</a>
        <button class="remove-tab" data-session-id="${session.id}" data-tab-index="${index}">×</button>
      </div>
    `).join('');
  }

  setupSessionEventListeners(card, session, index) {
    const sessionId = session.id;
    
    // Setup drag and drop
    this.setupDragAndDrop(card, index);
    
    // Launch button
    card.querySelector('.launch-button').addEventListener('click', () => {
      this.launchSession(sessionId);
    });
    
    // Expand/collapse
    const expandButton = card.querySelector('.expand-arrow');
    const sessionContent = card.querySelector('.session-content');
    
    expandButton.addEventListener('click', () => {
      const isExpanded = sessionContent.classList.contains('expanded');
      sessionContent.classList.toggle('expanded');
      expandButton.classList.toggle('expanded');
      expandButton.textContent = isExpanded ? '⌄' : '⌃';
      
      // Track expanded state
      if (isExpanded) {
        this.expandedSessions.delete(sessionId);
      } else {
        this.expandedSessions.add(sessionId);
      }
    });
    
    // Delete session button
    card.querySelector('.delete-button').addEventListener('click', () => {
      this.deleteSession(sessionId);
    });
    
    // Double-click session name to rename
    const sessionNameEl = card.querySelector('.session-name');
    sessionNameEl.addEventListener('dblclick', () => {
      this.startRenameSession(sessionId);
    });
    
    // Tab event listeners
    this.setupTabEventListeners(card, sessionId);
  }

  setupTabEventListeners(card, sessionId) {
    // Tab checkboxes
    const checkboxes = card.querySelectorAll('.tab-checkbox');
    const selectedCountEl = card.querySelector('.selected-count');
    const launchSelectedBtn = card.querySelector('.launch-selected');
    
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', () => {
        const selectedCount = card.querySelectorAll('.tab-checkbox:checked').length;
        selectedCountEl.textContent = `${selectedCount} selected`;
        launchSelectedBtn.disabled = selectedCount === 0;
      });
    });
    
    // Launch selected
    launchSelectedBtn.addEventListener('click', () => {
      const selectedIndices = Array.from(card.querySelectorAll('.tab-checkbox:checked'))
        .map(cb => parseInt(cb.dataset.tabIndex));
      this.launchSelectedTabs(sessionId, selectedIndices);
    });
    
    // Tab title clicks
    card.querySelectorAll('.tab-title').forEach(title => {
      title.addEventListener('click', (e) => {
        e.preventDefault();
        this.openSingleTab(title.dataset.url);
      });
    });
    
    // Remove tab buttons
    card.querySelectorAll('.remove-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabIndex = parseInt(btn.dataset.tabIndex);
        this.removeTabFromSession(sessionId, tabIndex);
      });
    });
  }

  startRenameSession(sessionId) {
    const sessionNameEl = document.querySelector(`[data-session-id="${sessionId}"].session-name`);
    const currentName = sessionNameEl.textContent;
    
    // Create input element
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'session-name-input';
    input.style.cssText = `
      background: white;
      border: 2px solid #3b82f6;
      border-radius: 4px;
      padding: 4px 8px;
      font-size: 15px;
      font-weight: 600;
      width: 100%;
      margin: -4px 0;
    `;
    
    // Replace with input
    sessionNameEl.replaceWith(input);
    input.focus();
    input.select();
    
    const finishRename = () => {
      const newName = input.value.trim();
      const newNameEl = document.createElement('div');
      newNameEl.className = 'session-name';
      newNameEl.dataset.sessionId = sessionId;
      newNameEl.textContent = newName || currentName;
      
      input.replaceWith(newNameEl);
      
      if (newName && newName !== currentName) {
        this.renameSession(sessionId, newName);
      }
    };
    
    input.addEventListener('blur', finishRename);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        input.blur();
      }
    });
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }
}

// Initialize the extension
document.addEventListener('DOMContentLoaded', () => {
  new QuickLaunchSessions();
});
