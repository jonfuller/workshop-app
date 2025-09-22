class WorkshopApp {
    constructor() {
        this.steps = [];
        this.currentStepIndex = 0;
        this.workshopTitle = '';
        this.mode = this.getMode();
        this.participantId = null;
        this.participantName = null;
        this.participants = new Map();
        this.completedSteps = new Set();
        this.ws = null;
        this.init();
    }

    getMode() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('mode') || 'master';
    }

    async init() {
        try {
            await this.loadSteps();
            this.setupWebSocket();
            this.setupUI();
        } catch (error) {
            console.error('Failed to initialize workshop app:', error);
            this.showError('Failed to load workshop steps');
        }
    }

    async loadSteps() {
        const response = await fetch('steps.json');
        const data = await response.json();
        this.steps = data.steps;
        this.workshopTitle = data.workshopTitle;
    }

    setupWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to workshop server');
            if (this.mode === 'master') {
                this.ws.send(JSON.stringify({ type: 'request_state' }));
            }
        };
        
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.handleWebSocketMessage(data);
        };
        
        this.ws.onclose = () => {
            console.log('Disconnected from workshop server');
            setTimeout(() => this.setupWebSocket(), 3000); // Reconnect after 3 seconds
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'joined':
                this.participantId = data.participantId;
                this.currentStepIndex = data.currentStep;
                this.render();
                break;
            case 'participant_joined':
                this.participants.set(data.participant.id, data.participant);
                this.renderParticipants();
                break;
            case 'participant_left':
                this.participants.delete(data.participantId);
                this.renderParticipants();
                break;
            case 'step_completed':
                const participant = this.participants.get(data.participantId);
                if (participant) {
                    participant.completedSteps = participant.completedSteps || [];
                    if (!participant.completedSteps.includes(data.stepId)) {
                        participant.completedSteps.push(data.stepId);
                    }
                    this.renderParticipants();
                }
                break;
            case 'step_changed':
                this.currentStepIndex = data.stepIndex;
                this.render();
                break;
            case 'state_update':
                data.participants.forEach(p => {
                    this.participants.set(p.id, p);
                });
                this.currentStepIndex = data.currentStep;
                this.render();
                this.renderParticipants();
                break;
        }
    }

    setupUI() {
        if (this.mode === 'participant') {
            document.getElementById('master-view').style.display = 'none';
            document.getElementById('participant-view').style.display = 'block';
            this.showJoinModal();
        } else {
            document.getElementById('participant-view').style.display = 'none';
            document.getElementById('master-view').style.display = 'block';
            this.render();
        }
    }

    showJoinModal() {
        document.getElementById('join-modal').style.display = 'block';
        document.getElementById('participant-name').focus();
        
        document.getElementById('participant-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.joinWorkshop();
            }
        });
    }

    joinWorkshop() {
        const name = document.getElementById('participant-name').value.trim();
        if (!name) {
            alert('Please enter your name');
            return;
        }
        
        this.participantName = name;
        document.getElementById('join-modal').style.display = 'none';
        document.getElementById('participant-name-display').textContent = `Welcome, ${name}!`;
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'join',
                name: name
            }));
        }
    }

    render() {
        if (this.mode === 'master') {
            this.renderMaster();
        } else {
            this.renderParticipant();
        }
    }

    renderMaster() {
        document.getElementById('workshop-title').textContent = this.workshopTitle;
        
        if (this.steps.length > 0) {
            const currentStep = this.steps[this.currentStepIndex];
            document.getElementById('step-title-master').textContent = `Step ${currentStep.id}: ${currentStep.title}`;
            document.getElementById('step-description-master').textContent = currentStep.description;
            document.getElementById('estimated-time-master').textContent = `Estimated time: ${currentStep.estimatedTime}`;
        }
        
        const participantCount = this.participants.size;
        document.getElementById('progress-text').textContent = `${participantCount} participant${participantCount !== 1 ? 's' : ''}`;
    }

    renderParticipant() {
        document.getElementById('workshop-title-participant').textContent = this.workshopTitle;
        
        if (this.steps.length > 0 && this.participantId) {
            const currentStep = this.steps[this.currentStepIndex];
            const isCompleted = this.completedSteps.has(currentStep.id);
            
            document.getElementById('step-title-participant').textContent = `Step ${currentStep.id}: ${currentStep.title}`;
            document.getElementById('step-description-participant').textContent = currentStep.description;
            document.getElementById('estimated-time-participant').textContent = `Estimated time: ${currentStep.estimatedTime}`;
            
            const completeBtn = document.getElementById('complete-btn-participant');
            completeBtn.disabled = isCompleted;
            completeBtn.textContent = isCompleted ? 'Completed ✓' : 'Mark as Complete';
            completeBtn.classList.toggle('completed', isCompleted);
            
            // Update progress
            const completedCount = this.completedSteps.size;
            const totalCount = this.steps.length;
            const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
            
            document.getElementById('progress-fill-participant').style.width = `${progressPercent}%`;
            document.getElementById('progress-text-participant').textContent = `${completedCount} of ${totalCount} steps completed`;
            
            this.renderStepsList();
        }
    }

    renderStepsList() {
        const stepsList = document.getElementById('steps-list-participant');
        stepsList.innerHTML = '';
        
        this.steps.forEach((step, index) => {
            const li = document.createElement('li');
            const isCompleted = this.completedSteps.has(step.id);
            const isCurrent = index === this.currentStepIndex;
            
            li.className = `step-item ${isCompleted ? 'completed' : ''} ${isCurrent ? 'current' : ''}`;
            li.innerHTML = `
                <span class="step-number">${step.id}</span>
                <span class="step-title">${step.title}</span>
                <span class="step-status">${isCompleted ? '✓' : '○'}</span>
            `;
            
            stepsList.appendChild(li);
        });
    }

    renderParticipants() {
        if (this.mode !== 'master') return;
        
        const participantsList = document.getElementById('participants-list');
        
        if (this.participants.size === 0) {
            participantsList.innerHTML = '<p class="empty-state">No participants yet. Share the QR code!</p>';
            return;
        }
        
        participantsList.innerHTML = '';
        
        this.participants.forEach((participant) => {
            const participantDiv = document.createElement('div');
            participantDiv.className = 'participant-card';
            
            const completedSteps = participant.completedSteps || [];
            const progressPercent = this.steps.length > 0 ? (completedSteps.length / this.steps.length) * 100 : 0;
            
            participantDiv.innerHTML = `
                <div class="participant-header">
                    <h4>${participant.name}</h4>
                    <span class="participant-progress">${completedSteps.length}/${this.steps.length}</span>
                </div>
                <div class="participant-progress-bar">
                    <div class="participant-progress-fill" style="width: ${progressPercent}%"></div>
                </div>
                <div class="participant-steps">
                    ${this.steps.map(step => {
                        const isCompleted = completedSteps.includes(step.id);
                        return `<span class="step-indicator ${isCompleted ? 'completed' : ''}" title="Step ${step.id}: ${step.title}">${step.id}</span>`;
                    }).join('')}
                </div>
            `;
            
            participantsList.appendChild(participantDiv);
        });
    }

    completeCurrentStep() {
        if (this.mode !== 'participant' || !this.participantId || this.steps.length === 0) return;
        
        const currentStep = this.steps[this.currentStepIndex];
        if (this.completedSteps.has(currentStep.id)) return;
        
        this.completedSteps.add(currentStep.id);
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'step_complete',
                stepId: currentStep.id
            }));
        }
        
        this.render();
    }

    previousStepMaster() {
        if (this.mode !== 'master' || this.currentStepIndex === 0) return;
        
        this.currentStepIndex--;
        this.render();
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'step_change',
                stepIndex: this.currentStepIndex
            }));
        }
    }

    nextStepMaster() {
        if (this.mode !== 'master' || this.currentStepIndex >= this.steps.length - 1) return;
        
        this.currentStepIndex++;
        this.render();
        
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'step_change',
                stepIndex: this.currentStepIndex
            }));
        }
    }

    async showQRCode() {
        try {
            const response = await fetch('/qr');
            const data = await response.json();
            
            document.getElementById('qr-code-container').innerHTML = `<img src="${data.qr}" alt="QR Code">`;
            document.getElementById('join-url').textContent = data.url;
            document.getElementById('qr-modal').style.display = 'block';
        } catch (error) {
            console.error('Failed to load QR code:', error);
            alert('Failed to load QR code');
        }
    }

    closeQRCode() {
        document.getElementById('qr-modal').style.display = 'none';
    }

    showError(message) {
        if (this.mode === 'master') {
            document.getElementById('step-title-master').textContent = 'Error';
            document.getElementById('step-description-master').textContent = message;
        } else {
            document.getElementById('step-title-participant').textContent = 'Error';
            document.getElementById('step-description-participant').textContent = message;
        }
    }
}

// Global functions for button onclick handlers
let app;

function joinWorkshop() {
    app.joinWorkshop();
}

function completeCurrentStep() {
    app.completeCurrentStep();
}

function previousStepMaster() {
    app.previousStepMaster();
}

function nextStepMaster() {
    app.nextStepMaster();
}

function showQRCode() {
    app.showQRCode();
}

function closeQRCode() {
    app.closeQRCode();
}

// Initialize app when page loads
document.addEventListener('DOMContentLoaded', () => {
    app = new WorkshopApp();
});
