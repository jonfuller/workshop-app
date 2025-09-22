const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Store workshop state
let workshopState = {
    participants: new Map(),
    currentStep: 0,
    steps: []
};

// Serve static files
app.use(express.static(path.join(__dirname)));

// Generate QR code for joining
app.get('/qr', async (req, res) => {
    try {
        const baseUrl = process.env.NODE_ENV === 'production' 
            ? `https://${req.get('host')}`
            : `http://localhost:${PORT}`;
        const joinUrl = `${baseUrl}/?mode=participant`;
        const qr = await QRCode.toDataURL(joinUrl);
        res.json({ qr, url: joinUrl });
    } catch (err) {
        res.status(500).json({ error: 'Failed to generate QR code' });
    }
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection');
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            handleMessage(ws, data);
        } catch (err) {
            console.error('Failed to parse message:', err);
        }
    });
    
    ws.on('close', () => {
        // Remove participant when they disconnect
        for (let [id, participant] of workshopState.participants) {
            if (participant.ws === ws) {
                workshopState.participants.delete(id);
                broadcast({
                    type: 'participant_left',
                    participantId: id
                });
                break;
            }
        }
    });
});

function handleMessage(ws, data) {
    switch (data.type) {
        case 'join':
            handleJoin(ws, data);
            break;
        case 'step_complete':
            handleStepComplete(ws, data);
            break;
        case 'step_change':
            handleStepChange(ws, data);
            break;
        case 'request_state':
            sendCurrentState(ws);
            break;
    }
}

function handleJoin(ws, data) {
    const participant = {
        id: generateId(),
        name: data.name,
        completedSteps: new Set(),
        ws: ws
    };
    
    workshopState.participants.set(participant.id, participant);
    
    // Send participant their ID
    ws.send(JSON.stringify({
        type: 'joined',
        participantId: participant.id,
        currentStep: workshopState.currentStep
    }));
    
    // Broadcast new participant to everyone
    broadcast({
        type: 'participant_joined',
        participant: {
            id: participant.id,
            name: participant.name,
            completedSteps: Array.from(participant.completedSteps)
        }
    });
}

function handleStepComplete(ws, data) {
    const participant = findParticipantByWs(ws);
    if (participant) {
        participant.completedSteps.add(data.stepId);
        
        broadcast({
            type: 'step_completed',
            participantId: participant.id,
            stepId: data.stepId
        });
    }
}

function handleStepChange(ws, data) {
    workshopState.currentStep = data.stepIndex;
    
    broadcast({
        type: 'step_changed',
        stepIndex: data.stepIndex
    });
}

function findParticipantByWs(ws) {
    for (let participant of workshopState.participants.values()) {
        if (participant.ws === ws) {
            return participant;
        }
    }
    return null;
}

function sendCurrentState(ws) {
    const participants = Array.from(workshopState.participants.values()).map(p => ({
        id: p.id,
        name: p.name,
        completedSteps: Array.from(p.completedSteps)
    }));
    
    ws.send(JSON.stringify({
        type: 'state_update',
        participants: participants,
        currentStep: workshopState.currentStep
    }));
}

function broadcast(data, excludeWs = null) {
    const message = JSON.stringify(data);
    
    wss.clients.forEach((client) => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

server.listen(PORT, () => {
    console.log(`Workshop server running on http://localhost:${PORT}`);
    console.log(`Master view: http://localhost:${PORT}/?mode=master`);
    console.log(`Participant view: http://localhost:${PORT}/?mode=participant`);
});
