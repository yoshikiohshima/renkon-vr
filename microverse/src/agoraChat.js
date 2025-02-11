// Copyright 2022 by Croquet Corporation, Inc. All Rights Reserved.
// https://croquet.io
// info@croquet.io

import { Data, ViewService, GetPawn } from "./worldcore";

export class AgoraChatManager extends ViewService {
    constructor(name) {
        super(name || "AgoraChatManager");
        this.subscribe("playerManager", "enter", "playerEnter");
        this.subscribe("playerManager", "leave", "playerLeave");
        this.subscribe("playerManager", "detailsUpdated", "playerDetailsUpdated");

        this.startMessageListener();

        // if this view's player is already in the world, make sure the embedded
        // chat app is running.
        const player = this.localPlayer;
        const alreadyHere = player && player.inWorld;

        if (alreadyHere) this.ensureChatIFrame();

        console.log(`AgoraChatManager (local actor ${alreadyHere ? "already" : "not yet"} here)`, this);
    }

    get localPlayer() { return this.model.service("PlayerManager").players.get(this.viewId);  }

    computeSessionHandles() {
        // derive handles { persistent, ephemeral } from the
        // persistentId and sessionId respectively.
        const hasher = id => Data.hash(id).slice(0, 8); // chat app only uses 8 chars
        const persistent = this.session.persistentId;
        const ephemeral = this.sessionId;
        return { persistent: hasher(persistent), ephemeral: hasher(ephemeral)};
    }

    startMessageListener() {
        this.messageListener = e => {
            if (!this.chatIFrame) return;

            if (e.source === this.chatIFrame.contentWindow) this.handleChatFrameEvent(e.data);
        };
        window.addEventListener('message', this.messageListener);
    }

    sendMessageToChat(event, data = null) {
        if (!this.chatIFrame) {
            console.warn(`attempt to send ${event} event before chat initialized`);
            return;
        }
        this.chatIFrame.contentWindow.postMessage({ event, data }, "*");
    }

    handleChatFrameEvent({ event, data }) {
        // console.log(event, data);
        switch (event) {
            case 'sessionInfoRequest':
                this.handleSessionInfoRequest(data);
                break;
            case 'userInfoRequest':
                this.handleUserInfoRequest(data);
                break;
            case 'videoChatInitialStateRequest':
                this.handleVideoChatInitialStateRequest(data);
                break;
            case 'chatReady':
                this.handleChatReady(data);
                break;
            case 'chatJoined':
                this.handleChatJoined(data);
                break;
            case 'chatLeft':
                this.handleChatLeft(data);
                break;
            case 'setFrameStyle':
                this.handleSetFrameStyle(data);
                break;
            case "setAvatarURL":
                this.handleSetAvatarURL(data);
                break;
            default:
                console.warn(`unknown event ${event} from chat iframe`);
        }
    }

    ensureChatIFrame() {
        if (this.chatIFrame) return;

        const existing = document.getElementById('agoraChatIFrame');
        if (existing) {
            // not sure there is any legitimate way this can happen
            console.warn("AgoraChatMgr: found existing iframe");
            this.chatIFrame = existing;
            this.chatReady = true; // assume it's ready
            return;
        }

        // use chatReady flag to avoid sending important messages to the chat iframe
        // until we've heard from it that it's ready to start.
        // if we include the url option requestName, this won't happen until the chat
        // has requested and received from the user a nickname.
        this.chatReady = false;
        const frame = this.chatIFrame = document.createElement('iframe');
        frame.id = 'agoraChatIFrame';
        frame.style.cssText = "position: absolute; width: 1px; height: 1px; z-index: 100; transition: none;"
        frame.setAttribute("allow", "microphone;camera");
        frame.setAttribute("sandbox", "allow-same-origin allow-scripts");
        let microverse = document.querySelector("#microverse");
        (microverse || document.body).appendChild(frame);
        const chatURL = new URL(`../video-chat/microverse.html?debug=session`, window.location.href).href;
        // const chatURL = new URL(`http://localhost:8000/video-chatv4/microverse.html?debug=session`).href;
        frame.src = chatURL;
    }

    handleSessionInfoRequest() {
        const { persistent, ephemeral } = this.computeSessionHandles();
        this.sendMessageToChat('sessionInfo', { sessionHandle: persistent, ephemeralSessionHandle: ephemeral });
    }

    handleUserInfoRequest() {
        const { _name: nick } = this.localPlayer;
        const userInfo = { initials: this.viewId.slice(0, 2), nickname: nick || '' };
        this.sendMessageToChat('userInfo', userInfo);
    }

    handleVideoChatInitialStateRequest() {
        let info = {
            mic: 'on',
            video: 'unavailable'
        };
        this.sendMessageToChat('videoChatInitialState', info);
    }

    handleChatReady(_data) {
        this.chatReady = true;
        this.updateActiveInChat();
    }

    handleChatJoined(_data) {
        this.publish("playerManager", "details", { playerId: this.viewId, details: { inChat: true } });
    }

    handleChatLeft(_data) {
        this.publish("playerManager", "details", { playerId: this.viewId, details: { inChat: false } });
    }

    handleSetFrameStyle(data, _source) {
        Object.assign(this.chatIFrame.style, data);
    }

    playerEnter(p) {
        if (p.playerId !== this.viewId) {
            this.updateActiveInChat();
            return;
        }

        console.log("our player entered");
        this.ensureChatIFrame();
    }

    playerLeave(p) {
        this.updateActiveInChat(); // whichever player left, its actor.inWorld will already have been updated
        if (p.playerId !== this.viewId) return;

        console.log("our player left");
        if (!this.chatIFrame) return;

        this.sendMessageToChat('leaveChat');
    }

    playerDetailsUpdated(_p) {
        this.updateActiveInChat();
    }

    updateActiveInChat() {
        // tell the chat iframe which users are currently in the chat, as updated in
        // the player states in response to events from each user's AgoraChatManager
        if (!this.chatReady) return;

        const inChat = this.model.service("PlayerManager").playersInWorld().filter(p => p._inChat).map(p => p._name);
        if (this.lastInChat?.length === inChat.length && !inChat.some((nick, i) => this.lastInChat[i] !== nick)) return;

        this.lastInChat = inChat;
        this.sendMessageToChat('activeInChat', { inChat });
    }

    destroy() {
        console.log("AgoraChatMgr: destroy");
        window.removeEventListener('message', this.messageListener);
        if (this.chatIFrame) this.chatIFrame.remove(); // will cause us to crash out of Agora chat, probably not cleanly
        this.chatIFrame = null;
        this.chatReady = false;
        super.destroy();
    }
}
