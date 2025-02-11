// Copyright 2022 by Croquet Corporation, Inc. All Rights Reserved.
// https://croquet.io
// info@croquet.io

import { GetPawn, RegisterMixin } from "./worldcore";

//------------------------------------------------------------------------------------------
//-- AM_PointerTarget ----------------------------------------------------------------------
//------------------------------------------------------------------------------------------

// Copied from the implementaion in Worldcore, but heavily modified to support event listener style dynamic manipulation of event listeners.

// eventListeners:Map<eventName:EventName, Array<{moduleName:string, behaviorName:string, eventName:string, listener:string}>>

export const AM_PointerTarget = superclass => class extends superclass {
    init(options) {
        super.init(options);
        this.eventListeners = new Map();
        this.listen("dispatchEvent", this.dispatchEvent);
    }

    // When an actor-side event listener for a pointer event is added,
    // the pawn automatically sends the pointer event over the
    // dispatchEvent Croquet event.  If the lister registered has
    // moduleName and behaviorName, it invokes the behavior method.
    // Otherwise, it looks up the method from the base object and
    // invokes it.
    dispatchEvent(data) {
        // console.log("dispatchEvent", data);
        let {eventName, evt} = data;
        let array = this.eventListeners.get(eventName);
        if (!array) {return;}

        array.forEach((obj) => {
            let {moduleName, behaviorName, listener} = obj;
            if (moduleName && behaviorName) {
                this.call(`${moduleName}$${behaviorName}`, listener, evt);
            } else {
                this[listener](evt);
            }
        });
    }

    addEventListener(eventName, listener) {
        // console.log("addEventListener", eventName, listener);
        let origListener = listener;
        if (typeof listener === "function") {
            listener = listener.name;
        }

        let behaviorName;
        let moduleName;

        let dollar = listener.indexOf("$");

        if (dollar >= 1) {
            moduleName = listener.slice(0, dollar);
            listener = listener.slice(dollar + 1);
        }

        let dot = listener.indexOf(".");
        if (dot >= 1) {
            behaviorName = listener.slice(0, dot);
            listener = listener.slice(dot + 1);
        }

        let behavior = this._behavior;

        if (!moduleName && behavior) {
            moduleName = behavior.module.externalName;
        }

        if (!behaviorName && behavior) {
            let compiled = behavior.ensureBehavior();
            behaviorName = compiled.$behaviorName;
        }

        let array = this.eventListeners.get(eventName);
        if (!array) {
            array = [];
            this.eventListeners.set(eventName, array);
        }
        if (array.findIndex((obj) => {
            return obj.eventName === eventName &&
                obj.listener === listener &&
                obj.moduleName === moduleName &&
                obj.behaviorName === behaviorName
        }) >= 0) {
            this.removeEventListener(eventName, origListener, true);
            // console.log("multiple registration of the same function");
        }
        array.push({moduleName, behaviorName, eventName, listener});

        this.say("registerEventListener", {eventName, listener});
    }

    removeEventListener(eventName, listener, noDelete) {
        // console.log("removeEventListener", eventName, listener);
        if (typeof listener === "function") {
            listener = listener.name;
        }

        /*

        if (listener.indexOf(".") >= 1) {
            let split = listener.split(".");
            behavior = split[0];
            listener = split[1];
        }

        */

        let behaviorName = this._behavior.ensureBehavior().$behaviorName;
        let moduleName = this._behavior.module.externalName;

        let array = this.eventListeners.get(eventName);
        if (!array) {
            // console.log("try to remove non-existent listener");
            return;
        }
        let ind = array.findIndex((obj) => obj.behaviorName === behaviorName && obj.moduleName === moduleName && obj.listener === listener);
        if (ind < 0) {
            // console.log("try to remove non-existent listener");
            return;
        }
        array.splice(ind, 1);
        if (array.length === 0) {
            if (!noDelete) {
                this.eventListeners.delete(eventName);
            }
            this.say("unregisterEventListener", {eventName, listener});
        }
    }
}
RegisterMixin(AM_PointerTarget);

//------------------------------------------------------------------------------------------
//-- PM_PointerTarget ----------------------------------------------------------------------
//------------------------------------------------------------------------------------------

// Copied from the implementaion in Worldcore, but heavily modified to support event listener style dynamic manipulation of event listeners.

// eventListeners:Map<eventName:EventName, Array<{name:string, eventName:string, listener:function}>>
// This manages the event listeners added to the pawn side.

// modelListeners:Map<eventName:EventName, func:function
// When an event listener for a pointer event is added to the actor side, the pawn was notified so that it should send a dispatchEvent when the specified pointerEvent type occurs on the pawn side.

export const PM_PointerTarget = superclass => class extends superclass {
    constructor(actor) {
        super(actor);
        this.eventListeners = new Map();
        this.modelListeners = new Map();

        this.listen("registerEventListener", "registerEventListener");
        this.listen("unregisterEventListener", "unregisterEventListener");

        // if (this.onKeyDown) this.listen("keyDown", this.onKeyDown);
        // if (this.onKeyUp) this.listen("keyUp", this.onKeyUp);

        this.registerAllEventListeners();
    }

    destroy() {
        let avatar = this.actor.service("PlayerManager").players.get(this.viewId);
        const avatarPawn = GetPawn(avatar.id);
        if (avatarPawn) {
            if (avatarPawn.hoverPawn === this) {
                avatarPawn.hoverPawn = null;
            }
            if (avatarPawn.focusPawn === this) {
                avatarPawn.focusPawn = null;
            }
        }
        super.destroy();
    }

    addEventListener(eventName, listener, name) {
        let origListener = listener;
        if (typeof listener === "string") {
            name = listener;
            listener = (evt) => this[name](evt);
        } else {
            if (!name) {
                name = listener.name;
            }
        }
        let array = this.eventListeners.get(eventName);
        if (!array) {
            array = [];
            this.eventListeners.set(eventName, array);
        }
        if (array.find((obj) => {
            return obj.name === name &&
                obj.eventName === eventName;
        })) {
            this.removeEventListener(eventName, origListener, name);
            // console.log("multiple registration of the same function");
        }
        array.push({name, eventName, listener});
    }

    removeEventListener(eventName, listener, name) {
        if (typeof listener === "string") {
            name = listener;
            // listener = (evt) => this[listener](evt);
        } else {
            if (!name) {
                name = listener.name;
            }
        }
        let array = this.eventListeners.get(eventName);
        if (!array) {
            // console.log("try to remove non-existent listener");
            return;
        }
        let ind = array.findIndex((obj) => {
            return obj.name === name &&
                obj.eventName === eventName;
        });
        if (ind < 0) {
            // console.log("try to remove non-existent listener");
            return;
        }
        array.splice(ind, 1);
    }

    registerEventListener(data) {
        // console.log("registerEventLIstener", data);
        let {eventName} = data;
        let func = (evt) => this.say("dispatchEvent", {eventName, evt: evt});
        this.modelListeners.set(eventName, func);
        this.addEventListener(eventName, func, `dispatch_${eventName}`);
    }

    unregisterEventListener(data) {
        let {eventName, _listener} = data;
        let func = this.modelListeners.get(eventName);
        if (!func) {return;}
        this.removeEventListener(eventName, func, `dispatch_${eventName}`);
    }

    // this is called only upon the initialization time. If the actor
    // already has some entries in the eventListeners, the pawn sets
    // up the disptchEvent link for them.

    registerAllEventListeners() {
        if (!this.actor.eventListeners) {return;}
        for (let eventName of this.actor.eventListeners.keys()) {
            this.registerEventListener({eventName});
        }
    }
}

//------------------------------------------------------------------------------------------
//-- PM_Pointer ----------------------------------------------------------------------------
//------------------------------------------------------------------------------------------

// Copied from the implementaion in Worldcore, but heavily modified to support event listener style dynamic manipulation of event listeners.

// This mixin is used by the avatar to implement the event routing.

export const PM_Pointer = superclass => class extends superclass {
    constructor(actor) {
        super(actor);
        if (!this.isMyPlayerPawn) {return;}

        /* Microverse uses InputManager from Worldcore */

        // immediate handling so handler runs inside of the DOM event handler invocation
        // and can open links, toggle audio, etc.
        this.subscribe("_input", {event: "pointerDown", handling: "immediate"}, this.doPointerDown);
        this.subscribe("_input", {event: "pointerUp", handling: "immediate"}, this.doPointerUp);
        this.subscribe("_input", {event: "pointerMove", handling: "immediate"}, this.doPointerMove);
        this.subscribe("_input", {event: "click", handling: "immediate"}, this.doPointerClick);
        this.subscribe("_input", {event: "wheel", handling: "immediate"}, this.doPointerWheel);
        this.subscribe("_input", {event: "doubleDown", handling: "immediate"}, this.doPointerDoubleDown);
        this.subscribe("_input", {event: "tap", handling: "immediate"}, this.doPointerTap);
        this.subscribe("_input", {event: "keyDown", handling: "immediate"}, this.doKeyDown);
        this.subscribe("_input", {event: "keyUp", handling: "immediate"}, this.doKeyUp);

        this.firstResponders = new Map();
        this.lastResponders = new Map();
        // {eventName -> [{eventMask, pawn}]} // eventMask should be exclusive
    }

    modifierEqual(e1, e2) {
        return !!e1.altKey === !!e2.altKey && !!e1.ctrlKey === !!e2.ctrlKey && !!e1.metaKey === !!e2.metaKey && !!e1.shiftKey === !!e2.shiftKey;
    }

    addResponder(responders, eventName, eventMask, pawn) {
        if (pawn._target) {pawn = pawn._target;}
        let ms = ["altKey", "shiftKey", "ctrlKey", "metaKey"];
        let array = responders.get(eventName);
        if (!array) {
            array = [];
            responders.set(eventName, array);
        }

        function has() {
            for (let i = 0; i < array.length; i++) {
                let obj = array[i];
                let all = true;

                for (let i = 0; i < ms.length; i++) {
                    all = all && obj.eventMask[ms[i]] === eventMask[ms[i]]
                }
                if (obj.pawn === pawn && all) {return true;}
            }
            return false;
        }

        if (has()) {return;}

        array.forEach((obj) => {
            for (let i = 0; i < ms.length; i++) {
                if (obj.eventMask[ms[i]] && eventMask[ms[i]]) {
                    throw new Error(`${ms[i]} is already handled for ${eventName}`);
                }
            }
        });
        array.unshift({eventMask, pawn});
    }

    removeResponder(responders, eventName, eventMask, pawn) {
        if (pawn._target) {pawn = pawn._target;}
        let array = responders.get(eventName);
        if (!array) {return;}
        let responderIndex = array.findIndex((obj) => {
            let ms = ["altKey", "shiftKey", "ctrlKey", "metaKey"];
            let all = true;
            for (let i = 0; i < ms.length; i++) {
                if (obj.eventMask[ms[i]]) {
                    all = all && eventMask[ms[i]];
                }
            }
            return all;
        });

        if (responderIndex >= 0 && array[responderIndex].pawn === pawn) {
            array.splice(responderIndex, 1);
        }
    }

    findResponder(responders, e, eventName, requireModefier) {
        let array = responders.get(eventName);
        if (!array) {return null;}
        let responderIndex = array.findIndex((obj) => {
            let ms = ["altKey", "shiftKey", "ctrlKey", "metaKey"];
            let all = true;
            let any = false;
            for (let i = 0; i < ms.length; i++) {
                if (e[ms[i]]) {
                    any = true;
                    all = all && obj.eventMask[ms[i]];
                }
            }

            if (requireModefier && (Object.keys(obj.eventMask).length === 0 && !any)) {
                return true;
            }
            if (requireModefier && !any) {return false;}
            return all;
        });

        if (responderIndex >= 0) {
            return array[responderIndex].pawn;
        }
        return null;
    }

    addFirstResponder(eventName, eventMask, pawn) {
        return this.addResponder(this.firstResponders, eventName, eventMask, pawn);
    }

    removeFirstResponder(eventName, eventMask, pawn) {
        return this.removeResponder(this.firstResponders, eventName, eventMask, pawn);
    }

    findFirstResponder(e, eventName) {
        return this.findResponder(this.firstResponders, e, eventName, true);
    }

    addLastResponder(eventName, eventMask, pawn) {
        return this.addResponder(this.lastResponders, eventName, eventMask, pawn);
    }

    removeLastResponder(eventName, eventMask, pawn) {
        return this.removeResponder(this.lastResponders, eventName, eventMask, pawn);
    }

    findLastResponder(e, eventName) {
        return this.findResponder(this.lastResponders, e, eventName, false);
    }

    destroy() {
        super.destroy();
    }

    getTargets(type, optWalk) {
        const render = this.service("ThreeRenderManager");
        let objects = optWalk ? render.threeLayerUnion('pointer', 'walk') : render.threeLayer("pointer");
        return objects.filter((obj) => {
            let array = obj.wcPawn.eventListeners.get(type);
            return array && array.length !== 0;
        });
    }

    invokeListeners(type, target, rc, wcEvent) {
        let array = target.eventListeners.get(type);
        let event;
        if (!rc) {
            event = wcEvent;
        } else {
            event = this.pointerEvent(rc, wcEvent);
        }
        let handlerModuleName = this.actor._cardData.avatarEventHandler;
        if (this.has(`${handlerModuleName}$AvatarPawn`, "handlingEvent")) {
            try {
                this.call(`${handlerModuleName}$AvatarPawn`, "handlingEvent", type, target, event);
            } catch (e) {
                console.error(e);
            }
        }
        if (array) {
            array.forEach((n) => {
                try {
                    n.listener.call(target, event);
                } catch (e) {
                    console.error(e);
                }
            });
        }
    }

    pointerCapture(toPawn) {
        this.focusPawn = toPawn;
    }

    doPointerDown(e) {
        let eventName = "pointerDown";
        let rc = this.pointerRaycast(e, this.getTargets(eventName));

        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            this.invokeListeners(eventName, firstResponder, rc, e);
        } else {
            if (e.button === 0) {
                this.isPointerDown = true;
                if (this.focusPawn !== rc.pawn) {
                    this.focusPawn = rc.pawn;
                }
            }
            if (this.focusPawn) {
                this.invokeListeners(eventName, this.focusPawn, rc, e);
            } else {
                let lastResponder = this.findLastResponder(e, eventName);
                if (lastResponder) {
                    this.invokeListeners(eventName, lastResponder, rc, e);
                }
            }
        }

        return rc;
    }

    doPointerUp(e) {
        let eventName = "pointerUp";
        let rc = this.pointerRaycast(e, this.getTargets(eventName));

        this.isPointerDown = false;
        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            this.invokeListeners(eventName, firstResponder, rc, e);
        } else {
            if (this.focusPawn) {
                this.invokeListeners(eventName, this.focusPawn, rc, e);
            } else {
                let lastResponder = this.findLastResponder(e, eventName);
                if (lastResponder) {
                    this.invokeListeners(eventName, lastResponder, rc, e);
                }
                // this.focusPawn = null;
            }
        }

        return rc;
    }

    doPointerMove(e) {
        let eventName = "pointerMove";
        let rc = this.pointerRaycast(e, this.getTargets(eventName));

        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            this.invokeListeners(eventName, firstResponder, rc, e);
        } else {
            if (this.hoverPawn !== rc.pawn) {
                if (this.hoverPawn) {
                    this.invokeListeners("pointerLeave", this.hoverPawn, rc, e);
                }
                this.hoverPawn = rc.pawn;
                if (this.hoverPawn) {
                    this.invokeListeners("pointerEnter", this.hoverPawn, rc, e);
                }
            }

            if (this.isPointerDown && this.focusPawn && this.focusPawn === rc.pawn) { // dubious check
                this.invokeListeners(eventName, this.focusPawn, rc, e);
            } else {
                let lastResponder = this.findLastResponder(e, eventName);
                if (lastResponder) {
                    this.invokeListeners(eventName, lastResponder, rc, e);
                }
            }
        }
        return rc;
    }

    doPointerClick(e) {
        let eventName = "click";
        const rc = this.pointerRaycast(e, this.getTargets(eventName));

        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            return this.invokeListeners(eventName, firstResponder, rc, e);
        }

        if (rc.pawn) {
            this.invokeListeners(eventName, rc.pawn, rc, e);
        } else {
            let lastResponder = this.findLastResponder(e, eventName);
            if (lastResponder) {
                return this.invokeListeners(eventName, lastResponder, rc, e);
            }
        }
    }

    doPointerDoubleDown(e) {
        let eventName = "pointerDoubleDown";
        const rc = this.pointerRaycast(e, this.getTargets(eventName, true), true);

        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            return this.invokeListeners(eventName, firstResponder, rc, e);
        }

        if (rc.pawn) {
            this.invokeListeners(eventName, rc.pawn, rc, e);
        }
    }

    doPointerWheel(e) {
        let eventName = "pointerWheel";
        const rc = this.pointerRaycast(e, this.getTargets(eventName, true), true);

        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            return this.invokeListeners(eventName, firstResponder, rc, e);
        }

        if (rc.pawn) {
            this.invokeListeners(eventName, rc.pawn, rc, e);
        } else {
            let lastResponder = this.findLastResponder(e, eventName);
            if (lastResponder) {
                return this.invokeListeners(eventName, lastResponder, rc, e);
            }
        }
    }

    doPointerTap(e) {
        let eventName = "pointerTap";
        let rc = this.pointerRaycast(e, this.getTargets(eventName));

        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            return this.invokeListeners(eventName, firstResponder, rc, e);
        }

        if (rc.pawn) {
            this.invokeListeners(eventName, rc.pawn, rc, e);
        } else {
            let lastResponder = this.findLastResponder(e, eventName);
            if (lastResponder) {
                return this.invokeListeners(eventName, lastResponder, rc, e);
            }
        }
    }

    doKeyDown(e) {
        let eventName = "keyDown";
        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            return this.invokeListeners(eventName, firstResponder, null, e);
        }

        if (this.focusPawn) {
            this.invokeListeners(eventName, this.focusPawn, null, e);
        } else {
            let lastResponder = this.findLastResponder(e, eventName);
            if (lastResponder) {
                return this.invokeListeners(eventName, lastResponder, null, e);
            }
        }
    }

    doKeyUp(e) {
        let eventName = "keyUp";
        let firstResponder = this.findFirstResponder(e, eventName);
        if (firstResponder) {
            return this.invokeListeners(eventName, firstResponder, null, e);
        }

        if (this.focusPawn) {
            this.invokeListeners(eventName, this.focusPawn, null, e);
        }

        // this falling through part is also a hack, but we want to clear the wasd key bits in avatar.
        let lastResponder = this.findLastResponder(e, eventName);
        if (lastResponder) {
            return this.invokeListeners(eventName, lastResponder, null, e);
        }
    }

    pointerEvent(rc, wcEvent) {
        const pe = {avatarId: this.actor.id}
        if (rc.pawn) {
            pe.targetId = rc.pawn.actor.id;
            pe.xyz = rc.xyz;
            pe.uv = rc.uv;
            pe.normal = rc.normal;
            pe.distance = rc.distance;
        }
        pe.ctrlKey = wcEvent.ctrlKey;
        pe.altKey = wcEvent.altKey;
        pe.shiftKey = wcEvent.shiftKey;
        pe.metaKey = wcEvent.metaKey;
        pe.xy = wcEvent.xy;
        pe.pointerId = wcEvent.pointerId;
        pe.button = wcEvent.button;
        pe.buttons = wcEvent.buttons;
        pe.instanceId = rc.instanceId;
        pe.pressure = wcEvent.pressure;
        if (rc.ray) {
            pe.ray = {origin: rc.ray.origin.toArray(), direction: rc.ray.direction.toArray()};
        }
        if (wcEvent.deltaY !== undefined) {
            pe.deltaY = wcEvent.deltaY;
        }
        return pe;
    }
}
