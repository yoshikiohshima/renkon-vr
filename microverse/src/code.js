// Copyright 2022 by Croquet Corporation, Inc. All Rights Reserved.
// https://croquet.io
// info@croquet.io

import * as WorldcoreExports from "./worldcore";
const {ViewService, ModelService, GetPawn, Model, Constants, App} = WorldcoreExports;

import * as WorldcoreThreeExports from "./ThreeRender.js";
import * as PhysicsExports from "./physics.js";
import * as FrameExports from "./frame.js";
import {WorldSaver} from "./worldSaver.js";

import {TSCompiler, JSCompiler} from "./compiler.js";

let compiledBehaviors = new Map(); // <ScriptingBehavior, {$behavior, $behaviorName}

let isProxy = Symbol("isProxy");
function newProxy(object, handler, module, behavior) {
    if (object[isProxy]) {
        return object;
    }
    return new Proxy(object, {
        get(target, property) {
            // Note to developers:
            // You may be seeing this in the developer tool of the browser.
            // Don't worry! You can press the "Step into" button several times to get to the
            // "apply" line a few lines below. If you step into it, you will see the behavior
            // method you are trying to get to.
            if (property === isProxy) {return true;}
            if (property === "_target") {return object;}
            if (property === "_behavior") {return behavior;}
            if (handler && handler.hasOwnProperty(property)) {
                // let behavior handler override the method / getter
                const getter = Object.getOwnPropertyDescriptor(handler, property)?.get;
                // use the card object as "this" in behavior getters
                const handlerProp = getter ? getter.apply(object) : handler[property];
                return handlerProp;
            }
            return target[property];
        },
        set(target, property, value) {
            // let behavior handler override the method / getter
            const setter = handler && handler.hasOwnProperty(property) && Object.getOwnPropertyDescriptor(handler, property)?.set;
            if (setter) {
                // use the card object as "this" in behavior setters
                setter.apply(object, [value]);
            } else {
                target[property] = value;
            }
            return true;
        },
    });
}

function getViewRoot() {
    return window.viewRoot;
}

/* AM_Code: A mixin to support Live programming */

export const AM_Code = superclass => class extends superclass {
    init(options) {
        super.init(options);
        this.behaviorManager = this.service("BehaviorModelManager");
        this.scriptListeners = new Map();
    }

    initBehaviors(options) {
        if (options.behaviorModules) {
            options.behaviorModules.forEach((name) => { /* name: Bar */
                let module = this.behaviorManager.modules.get(name);
                if (!module) {
                    console.error(`unknown module ${name} is specified`);
                    return;
                }
                let {actorBehaviors, pawnBehaviors} = module;
                if (actorBehaviors) {
                    for (let behavior of actorBehaviors.values()) {
                        this.behaviorManager.modelUse(this, behavior);
                    }
                }
                if (pawnBehaviors) {
                    for (let behavior of pawnBehaviors.values()) {
                        this.behaviorManager.viewUse(this, behavior);
                    }
                }
            });
        }
    }

    destroy() {
        if (this[isProxy]) {
            return this._target.destroy();
        }
        if (this._behaviorModules) {
            this._behaviorModules.forEach((name) => { /* name: Bar */
                let module = this.behaviorManager.modules.get(name);
                if (!module) {
                    console.error(`unknown module ${name} is being torn down`);
                    return;
                }
                let {actorBehaviors, pawnBehaviors} = module;
                if (actorBehaviors) {
                    for (let behavior of actorBehaviors.values()) {
                        this.behaviorManager.modelUnuse(this, behavior);
                    };
                }
                if (pawnBehaviors) {
                    for (let behavior of pawnBehaviors.values()) {
                        this.behaviorManager.viewUnuse(this, behavior);
                    };
                }
            });
        }
        super.destroy();
    }

    future(time) {
        if (!this[isProxy]) {return super.future(time);}
        let compiled = this._behavior.getCompiledBehavior();
        let behaviorName = compiled.$behaviorName;
        let moduleName = this._behavior.module.externalName;
        return this.futureWithBehavior(time, moduleName, behaviorName);
    }

    // In order to enable a future call in the regular syntax:
    //    this.future(100).aBehaviorMethod()
    // the future call creates a proxy that remembers the calling behavior by name
    // and "aBehaviorMethod is looked up from the behavior.

    // A special case is needed when the method name is "call", therefore it expects
    // explicit specification of behavior.

    futureWithBehavior(time, moduleName, behaviorName) {
        let superFuture = (sel, args) => super.future(time, sel, ...args);
        let behaviorManager = this.behaviorManager;
        let basicCall = this.call;

        return new Proxy(this, {
            get(_target, property) {
                let behavior = behaviorManager.lookup(moduleName, behaviorName);

                let compiled = behavior.getCompiledBehavior();

                let func = property === "call" ? basicCall : compiled.$behavior[property];
                let fullName = property === "call" ?  "call" : `${moduleName}$${behaviorName}.${property}`;
                if (typeof func === "function") {
                    const methodProxy = new Proxy(func, {
                        apply(_method, _this, args) {
                            return superFuture(fullName, args);
                        }
                    });
                    return methodProxy;
                }
                throw Error("Tried to call " + property + "() on future of " + behaviorName + " which is not a function");
            }
        });
    }

    // call a behavior method. behaviorName is either ModuleName$BehaviorName or BehaviorName.
    // If former, the current (calling) module's name is used.
    call(behaviorName, name, ...values) {
        let moduleName;
        let split = behaviorName.split("$");
        if (split.length > 1) {
            moduleName = split[0];
            behaviorName = split[1];
        }
        if (!moduleName && this[isProxy]) {
            moduleName = this._behavior.module.externalName;
        }

        let behavior = this.behaviorManager.lookup(moduleName, behaviorName);
        if (!behavior) {
            throw new Error(`behavior named ${behaviorName} not found`);
        }

        return behavior.invoke(this[isProxy] ? this._target : this, name, ...values);
    }

    listen(eventName, listener) {
        return this.scriptSubscribe(this.id, eventName, listener);
    }

    subscribe(scope, eventName, listener) {
        return this.scriptSubscribe(scope, eventName, listener);
    }

    has(moduleName, maybeMethod) {
        return this.hasBehavior(moduleName, maybeMethod);
    }

    hasBehavior(moduleName, maybeMethod) {
        // either
        // moduleName = "A" and no maybeMethod: if the named module is installed to this
        // moduleName = "A$B" and no maybeMethod: if the named module installed to this and it has B
        // moduleName = "A$B" with maybeMethod: if the named module installed to this and it has B,
        //                                      and B has method maybeMethod

        return this.checkBehavior(this, true, moduleName, maybeMethod);
    }

    checkBehavior(obj, isActor, moduleName, maybeMethod) {
        let module;
        let behaviorName;

        if (moduleName.indexOf("$") > 0) {
            let split = moduleName.split("$");
            module = split[0];
            behaviorName = split[1];
        } else {
            module = moduleName;
            behaviorName = null;
        }

        if (!module && obj[isProxy]) {
            module = obj._behavior.module.externalName;
        }

        let who = obj;
        if (!isActor) {
            who = who.actor;
        }

        let behaviorModules = who._behaviorModules;
        let behaviorManager = who.behaviorManager;

        if (!behaviorModules) {return false;}
        if (!behaviorModules.includes(module)) {return false;}

        if (!behaviorName) {return true;}

        let behavior = behaviorManager.lookup(module, behaviorName);
        if (!behavior) {return false;}

        let $behavior;
        if (isActor) {
            $behavior = behavior.ensureBehavior().$behavior
        } else {
            $behavior = behavior.ensureBehavior().$behavior;
        }
        if (!maybeMethod) {return true;}
        return !!$behavior[maybeMethod];
    }

    // setup() of a behavior, and typically a subscribe call in it, gets called multiple times
    // in its life cycle because of live programming feature. This wrapper for subscribe records
    // the current set of subscription.
    //
    // canonical value of listener is a string that represents the name of a method.
    // So double registration is not a problem.
    scriptSubscribe(scope, eventName, listener) {
        // listener can be:
        // this.func
        // name for a base object method
        // name for a behavior method
        // string with "." for this module, a behavior and method name
        // // string with "$" and "." for external name of module, a behavior name, method name

        if (typeof listener === "function" && !this[isProxy]) {
            return super.subscribe(scope, eventName, listener);
        }

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
            behaviorName = behavior.getCompiledBehavior().$behaviorName;
        }

        let fullMethodName;
        if (!behaviorName) {
            fullMethodName = listener;
        } else {
            fullMethodName = `${moduleName}${moduleName ? "$" : ""}${behaviorName}${behaviorName ? "." : ""}${listener}`;
        }

        let listenerKey = `${scope}:${eventName}${fullMethodName}`;
        let had = this.scriptListeners && this.scriptListeners.get(listenerKey);
        if (had) {return;}

        // this check is needed when subscribe is called from constructors of superclasses.
        // That is, this.scriptListeners is only initialized after super constructor returns.
        if (this.scriptListeners) {
            this.scriptListeners.set(listenerKey, fullMethodName);
        }
        super.subscribe(scope, eventName, fullMethodName);
    }

    // this method adds an action to the code editor.
    // Probably better be split into a separate mixin.
    // also, in system edit
    codeAccepted(data) {
        let match = /^class[\s]+([\S]+)/.exec(data.text.trim());
        if (!match) {
            console.log("code does not begin with the keyword class and name");
            return;
        }

        let behaviorModule = this._cardData.behaviorModule;
        let [moduleName, behaviorName] = behaviorModule.split(".");
        let name = match[1];
        if (name !== behaviorName) {
            throw new Error("changing the behavior name not supported");
        }

        let current = this.behaviorManager.moduleDefs.get(moduleName);

        if (!current) {
            throw new Error("module no longer exists");
        }

        let copy = {
            name: current.name, systemModule: current.systemModule,
            location: current.location,
            actorBehaviors: new Map([...current.actorBehaviors]),
            pawnBehaviors: new Map([...current.pawnBehaviors]),
        };

        let currentBehavior = copy.actorBehaviors.get(behaviorName);
        if (currentBehavior) {
            if (copy.actorBehaviors.get(behaviorName) === data.text) {
                return;
            }
            copy.actorBehaviors.set(behaviorName, data.text);
        } else {
            currentBehavior = copy.pawnBehaviors.get(behaviorName);
            if (currentBehavior) {
                if (copy.pawnBehaviors.get(behaviorName) === data.text) {
                    return;
                }
                copy.pawnBehaviors.set(behaviorName, data.text);
            }
        }

        console.log("codeAccepted");
        this.behaviorManager.loadLibraries([copy]);
    }

    createCard(options) {
        // this is only here because we don't want to export isProxy Symbol.
        if (options.parent) {
            if (options.parent[isProxy]) {
                options = {...options, parent: options.parent._target};
            }
        }

        // oh, boy
        let rcvr = this[isProxy] ? this._target : this;

        let card = rcvr.constructor.load([{card: options}], this.wellKnownModel("ModelRoot"), "1")[0];
        this.publish(this.sessionId, "triggerPersist");
        return card;
    }

    queryCards(options, requestor) {
        let actorManager = this.service("ActorManager");
        let cards = [...actorManager.actors].filter((a) => a[1].isCard).map(a => a[1]);
        if (!options) {return cards;}
        if (options.moduleName && options.methodName) {
            cards = cards.filter((c) => requestor.call(options.moduleName, options.methodName, c));
        } else if (options.methodName) {
            cards = cards.filter((c) => requestor[options.methodName].call(requestor, c));
        }
        return cards;
    }
}

/* PM_Code: A mixin to support Live programming */

export const PM_Code = superclass => class extends superclass {
    constructor(actor) {
        super(actor);
        this.scriptListeners = new Map();
        let behaviorManager = this.actor.behaviorManager;

        this.subscribe(actor.id, "callSetup", "callSetup");
        this.subscribe(actor.id, "callTeardown", "callTeardown");

        if (actor._behaviorModules) {
            actor._behaviorModules.forEach((moduleName) => { /* name: Bar */
                let module = behaviorManager.modules.get(moduleName);
                let {pawnBehaviors} = module || {};
                if (pawnBehaviors) {
                    for (let behavior of pawnBehaviors.values()) {
                        if (behavior) {
                            let {$behavior, $behaviorName} = behavior.ensureBehavior();
                            // future(0) is used so that setup() is called after
                            // all behaviors specified are installed.
                            if ($behavior.setup) {
                                this.future(0).callSetup(`${module.externalName}$${$behaviorName}`);
                            }
                        }
                    }
                }
            });
        }
    }

    actorCall(behaviorName, name, ...values) {
        let actor = this.actor;
        let moduleName = this._behavior.module.externalName;
        return actor.call(`${moduleName}$${behaviorName}`, name, ...values);
    }

    // call a behavior method. behaviorName is either ModuleName$BehaviorName or BehaviorName.
    // If former, the current (calling) module's name is used.
    call(behaviorName, name, ...values) {
        let moduleName;
        let split = behaviorName.split("$");
        if (split.length > 1) {
            moduleName = split[0];
            behaviorName = split[1];
        }

        if (!moduleName && this[isProxy]) {
            moduleName = this._behavior.module.externalName;
        }

        let behavior = this.actor.behaviorManager.lookup(moduleName, behaviorName);
        if (!behavior) {
            throw new Error(`behavior named ${behaviorName} not found`);
        }

        return behavior.invoke(this[isProxy] ? this._target : this, name, ...values);
    }

    destroy() {
        // destroy in the super chain requires that the receiver is the original pawn, not a proxy.
        if (this[isProxy]) {
            return this._target.destroy();
        }
        if (this.actor._behaviorModules) {
            this.actor._behaviorModules.forEach((name) => { /* name: Bar */
                let module = this.actor.behaviorManager.modules.get(name);
                if (!module) {
                    console.error(`unknown module ${name} is specified`);
                }
                let {pawnBehaviors} = module;
                if (pawnBehaviors) {
                    for (let behavior of pawnBehaviors.values()) {
                        let {$behavior, $behaviorName} = behavior.ensureBehavior();
                        if ($behavior.teardown) {
                            this.call(`${behavior.module.externalName}$${$behaviorName}`, "teardown");
                        }
                    };
                }
            });
        }
        super.destroy();
    }

    callSetup(name) {
        return this.call(name, "setup");
    }

    callTeardown(name) {
        return this.call(name, "teardown");
    }

    scriptListen(subscription, listener) {
        return this.scriptSubscribe(this.actor.id, subscription, listener);
    }

    subscribe(scope, subscription, listener) {
        return this.scriptSubscribe(scope, subscription, listener);
    }

    has(moduleName, maybeMethod) {
        return this.hasBehavior(moduleName, maybeMethod);
    }

    hasBehavior(moduleName, maybeMethod) {
        return this.actor.checkBehavior(this, false, moduleName, maybeMethod);
    }

    // setup() of a behavior, and typically a subscribe call in it, gets called multiple times
    // in its life cycle because of live programming feature. This wrapper for subscribe records
    // the current set of subscription.
    //
    // canonical form of listner is a function.
    // We try to remove and replace the existing subscription if the "same" handler is registered.
    scriptSubscribe(scope, subscription, listener) {
        // listener can be:
        // this.func for a method in the calling behavior
        // name for a base object method
        // name for a behavior method
        // string with "." for this module, a behavior and method name
        // // string with "$" and "." for external name of module, a behavior name, method name

        if (typeof listener === "function" && !this[isProxy]) {
            return super.subscribe(scope, subscription, listener);
        }

        let eventName;
        let handling;
        if (typeof subscription === "string") {
            eventName = subscription;
        } else {
            eventName = subscription.event;
            handling = subscription.handling;
        }

        let behaviorName;
        let moduleName;

        if (typeof listener === "function") {
            listener = listener.name;
        }

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
            behaviorName = behavior.getCompiledBehavior().$behaviorName;
        }

        let fullMethodName;

        if (!behaviorName) {
            fullMethodName = listener;
        } else {
            fullMethodName = `${moduleName}${moduleName ? "$" : ""}${behaviorName}${behaviorName ? "." : ""}${listener}`;
        }

        let listenerKey = `${scope}:${eventName}${fullMethodName}`;

        let had = this.scriptListeners && this.scriptListeners.get(listenerKey);
        if (had) {
            this.unsubscribe(scope, eventName, fullMethodName);
        }

        if (this.scriptListeners) {
            this.scriptListeners.set(listenerKey, fullMethodName);
        }

        if (fullMethodName.indexOf(".") >= 1) {
            let split = fullMethodName.split(".");
            let func = (data) => this.call(split[0], split[1], data);
            return super.subscribe(scope, eventName, func);
        }
        if (handling) {
            super.subscribe(scope, {event: eventName, handling}, fullMethodName);
        } else {
            super.subscribe(scope, eventName, fullMethodName);
        }
    }

    update(time, delta) {
        super.update(time, delta);
        if (this.updateRequests) {
            this.updateRequests.forEach((u) => {
                // [behaviorName, methodName]
                this.call(...u, time, delta);
            });
        }
    }

    addUpdateRequest(array) {
        if (!this.updateRequests) {this.updateRequests = [];}
        let index = this.updateRequests.findIndex((o) => o[0] === array[0] && o[1] === array[1]);

        if (index >= 0) {return;}
        this.updateRequests.push(array);
    }

    removeUpdateRequest(array) {
        if (!this.updateRequests) {return;}
        let index = this.updateRequests.findIndex((o) => o[0] === array[0] && o[1] === array[1]);
        if (index < 0) {return;}
        this.updateRequests.splice(index, 1);
    }
}

// The class that represents a behavior.
// A behavior is like a class, and does not hold any state.
// so there is one instance of ScriptBehavior for each defined behavior.

class ScriptingBehavior extends Model {
    // static okayToIgnore() { return [ "$behavior", "$behaviorName" ]; }

    init(options) {
        this.systemBehavior = !!options.systemBehavior;
        this.module = options.module;
        this.name = options.name;
        this.type = options.type;
        this.location = options.location;
    }

    compileBehavior(string) {
        if (!string) {
            string = this.code;
        }
        let trimmed = string.trim();
        let source;
        if (trimmed.length === 0) {return;}
        if (/^class[ \t]/.test(trimmed)) {
            source = trimmed;
        }

        let code = `return (${source}) //# sourceURL=${window.location.origin}/behaviors_evaled/${this.location}/${this.name}`;
        let cls;
        try {
            const Microverse = {...WorldcoreExports, ...WorldcoreThreeExports, ...PhysicsExports, ...FrameExports, RAPIER: PhysicsExports.Physics, getViewRoot, WorldSaver};
            cls = new Function("Microverse", code)(Microverse);
        } catch(error) {
            console.log("error occured while compiling:", source, error);
            try {
                eval(source);
            } finally {
            }
        }

        if (typeof cls !== "function") {
            return;
        }

        return cls;
    }

    getCompiledBehavior() {
        return compiledBehaviors.get(this);
    }

    setCode(string, forView) {
        if (!string) {
            console.log("code is empty for ", this);
            return;
        }

        let theSame = this.code === string;
        let cls = this.compileBehavior(string);
        let result = {$behavior: cls.prototype, $behaviorName: cls.name};
        compiledBehaviors.set(this, result);

        if (forView) {
            if (!theSame) {
                throw Error("view cannot specify new code");
            }
        } else {
            if (!theSame) {
                this.code = string;
                this.publish(this.id, "setCode", string);
            }
        }
        return result;
    }

    ensureBehavior() {
        let entry = compiledBehaviors.get(this);
        if (!entry) {
            let cls = this.compileBehavior();
            entry = {$behavior: cls.prototype, $behaviorName: cls.name};
            compiledBehaviors.set(this, entry);
        }
        return entry;
    }

    invoke(receiver, name, ...values) {
        let {$behavior, $behaviorName} = this.ensureBehavior();
        let module = this.module;
        let result;

        let proxy = newProxy(receiver, $behavior, module, this);
        try {
            let prop = proxy[name];
            if (typeof prop === "undefined") {
                throw new Error(`a method named ${name} not found in ${$behaviorName || this}`);
            }
            if (typeof prop === "function") {
                result = prop.apply(proxy, values);
            } else {
                result = prop;
            }
        } catch (e) {
            console.error(`an error occured in ${$behaviorName}.${name}() on`, receiver, e);
            App.messages && App.showMessage(`Error in ${$behaviorName}.${name}()`, { level: "error" });
        }
        return result;
    }
}

ScriptingBehavior.register("ScriptingBehavior");

// The class that represents a behavior module.
// init sets up those properties but actorBehaviors and pawnBehaviors will be added.

class ScriptingModule extends Model {
    init(options) {
        super.init(options);
        this.name = options.name;
        this.systemModule = options.systemModule;
        this.location = options.location;
    }
}

ScriptingModule.register("ScriptingModule");

// Each code is a Model object whose contents is the text code
// the model's identifier is the id, but you can also refer to it by name
// If there are two classes with the same name, for now we can say that is not allowed.

export class BehaviorModelManager extends ModelService {
    init(name) {
        super.init(name || "BehaviorModelManager");

        this.cleanUp();

        this.subscribe(this.id, "loadStart", "loadStart");
        this.subscribe(this.id, "loadOne", "loadOne");
        this.subscribe(this.id, "loadDone", "loadDone");

        this.subscribe(this.sessionId, "disableCodeLoadFlag", "disableCodeLoadFlag");
        this.codeLoadDisabled = false;
    }

    disableCodeLoadFlag() {
        this.codeLoadDisabled = true;
    }

    cleanUp() {
        this.moduleDefs = new Map(); // <externalName /* Bar1 */, {name /*Bar*/, actorBehaviors: Map<name, codestring>, pawnBehaviors: Map<name, codestring>, systemModule: boolean, location:string?}>

        this.modules = new Map(); // <externalName /* Bar1 */, {name /*Bar*/, actorBehaviors: Map<name, codestring>, pawnBehaviors: Map<name, codestring>, systemModule: boolean, location:string?}>

        this.behaviors = new Map(); // {name: ScriptingBehavior}

        this.modelUses = new Map(); // {ScriptingBehavior, [cardActorId]}
        this.viewUses = new Map();  // {ScriptingBehavior [cardPawnId]}

        this.externalNames = new Map();
        this.loadCache = null;
    }

    createAvailableName(name, location) {
        let current = this.moduleDefs.get(name);
        if (!current) {return name;}

        for (let [n, o] of this.moduleDefs) {
            if (o.location === location && o.name === name) {
                return n;
            }
        }

        if (current.location === location) {
            return name;
        }

        let match = /([^0-9]+)([0-9]*)/.exec(name);
        let stem = match[1];
        let suffix = match[2];

        if (suffix.length === 0) {
            suffix = 0;
        } else {
            suffix = parseInt(suffix, 10);
        }

        while (true) {
            let newName = stem + (++suffix);
            if (!this.moduleDefs.get(newName)) {
                return newName;
            }
        }
    }

    lookup(externalName, behaviorName) {
        if (!externalName) {return null;}
        let module = this.modules.get(externalName);
        if (!module) {return null;}
        let b = module.actorBehaviors.get(behaviorName);
        if (b) {
            return b;
        }
        b = module.pawnBehaviors.get(behaviorName);
        if (b) {
            return b;
        }
        return null;
    }

    hasBehavior(externalName, behaviorName) {
        if (!externalName) {return false;}
        let module = this.modules.get(externalName);
        if (!module) {return false;}
        if (!behaviorName) {return true;}
        let b = module.actorBehaviors.get(behaviorName);
        if (b) {return true;}
        b = module.pawnBehaviors.get(behaviorName);
        if (b) {return true;}
        return false;
    }

    loadStart(key) {
        // last one wins
        this.key = key;
        this.loadCache = [];
    }

    loadOne(obj) {
        if (!this.key) {return;}
        if (obj.key !== this.key) {
            return;
        }
        this.loadCache.push(obj.buf);
    }

    loadDone(key) {
        if (!this.key) {return;}
        if (this.key !== key) {
            return;
        }

        let array = this.loadCache;
        this.loadCache = [];
        this.key = null;
        this.loadAll(array);
    }

    loadAll(array) {
        if (!array) {
            console.log("inconsistent message");
            return;
        }

        let len = array.reduce((acc, cur) => acc + cur.length, 0);
        let all = new Uint8Array(len);
        let ind = 0;
        for (let i = 0; i < array.length; i++) {
            all.set(array[i], ind);
            ind += array[i].length;
        }

        let result = new TextDecoder("utf-8").decode(all);
        let codeArray = JSON.parse(result);

        this.loadLibraries(codeArray);
        this.publish(this.sessionId, "triggerPersist");
    }

    loadLibraries(codeArray) {
        if (this.codeLoadDisabled) {return;}

        let changed = [];
        let nameMap = new Map();
        let userDir;
        if (Constants.UserBehaviorDirectory) {
            userDir = Constants.UserBehaviorDirectory.slice("behaviors/".length);
        }
        let systemDir;
        if (Constants.SystemBehaviorDirectory) {
            systemDir = Constants.SystemBehaviorDirectory.slice("behaviors/".length);
        }

        codeArray.forEach((moduleDef) => {
            let {action, name, systemModule, location} = moduleDef;
            if (location && !location.startsWith("(detached)")) {
                let index = location.lastIndexOf("/");
                let pathPart = location.slice(0, index);
                if (userDir && !pathPart.startsWith(userDir) && !pathPart.startsWith(systemDir)) {
                    return;
                }
            }

            let internalName = name;
            if (!action || action === "add") {
                let def = {...moduleDef};
                delete def.action;
                if (Array.isArray(def.actorBehaviors)) {
                    def.actorBehaviors = new Map(def.actorBehaviors);
                }
                if (Array.isArray(def.pawnBehaviors)) {
                    def.pawnBehaviors = new Map(def.pawnBehaviors);
                }

                name = this.createAvailableName(internalName, location); // it may be the same name
                nameMap.set(internalName, name);

                this.externalNames.set(`${location}$${moduleDef.name}`, name);
                this.moduleDefs.set(name, def);

                let m = {actorBehaviors: new Map(), pawnBehaviors: new Map()};

                let module = this.modules.get(name);
                if (!module) {
                    module = ScriptingModule.create({name: def.name, systemModule: def.systemModule, location: location});
                }
                module.externalName = name;

                ["actorBehaviors", "pawnBehaviors"].forEach((behaviorType) => {
                    if (moduleDef[behaviorType]) {
                        let map = moduleDef[behaviorType];
                        for (let [behaviorName, codeString] of map) {
                            // so when location is set, and the external name was
                            // synthesized due to a collision, we look up the external name
                            // from file path and module name.
                            // there should not be any other case.

                            // maybe be undefined
                            let externalName = this.externalNames.get(`${location}$${moduleDef.name}`);
                            let behavior = this.lookup(externalName, behaviorName);
                            if (!behavior) {
                                let cookedLocation = location;
                                if (location.startsWith("(detached):")) {
                                    cookedLocation = location.slice("(detached):".length);
                                }
                                behavior = ScriptingBehavior.create({
                                    systemBehavior: systemModule,
                                    module: module,
                                    name: behaviorName,
                                    location: cookedLocation,
                                    type: behaviorType.slice(0, behaviorType.length - 1)
                                });
                                behavior.setCode(codeString);
                                changed.push(behavior);
                            } else if (behavior.code !== codeString) {
                                behavior.setCode(codeString);
                                changed.push(behavior);
                            }
                            m[behaviorType].set(behaviorName, behavior);
                            // this.behaviors.set(behaviorName, behavior);
                        };
                    }
                });
                module.actorBehaviors = m.actorBehaviors;
                module.pawnBehaviors = m.pawnBehaviors;

                this.modules.set(module.externalName, module);
            }

            if (action === "remove") {
                for (let [k, v] of this.modules) {
                    if (v.location === location) {
                        /*for (let behaviorName of v.actorBehaviors.keys()) {
                            this.behaviors.delete(behaviorName);
                        }
                        for (let behaviorName of v.pawnBehaviors.keys()) {
                            this.behaviors.delete(behaviorName);
                            }*/
                        this.externalNameMap.delete(location);
                        this.modules.delete(k);
                        this.moduleDefs.delete(k);
                    }
                }
            }
        });

        let toPublish = [];
        changed.forEach((behavior) => {
            if (!behavior.getCompiledBehavior().$behavior.setup) {return;}
            if (behavior.type === "actorBehavior") {
                let modelUsers = this.modelUses.get(behavior);
                let actorManager = this.service("ActorManager");
                if (modelUsers) {
                    modelUsers.forEach((modelId) => {
                        let model = actorManager.get(modelId);
                        if (model) {
                            behavior.future(0).invoke(model, "setup");
                        }
                    });
                }
            } else if (behavior.type === "pawnBehavior") {
                toPublish.push([behavior.module.externalName, behavior.getCompiledBehavior().$behaviorName]);
            }
        });
        this.publish(this.id, "callViewSetupAll", toPublish);
        return nameMap;
    }

    save(optModuleNames) {
        let filtered = [...this.moduleDefs].filter(([_key, value]) => !value.systemModule);
        if (optModuleNames) {
            filtered = filtered.filter(([key, _value]) => optModuleNames.includes(key));
            filtered = filtered.map(([key, m]) => {
                let newM = {...m};
                if (newM.location) {
                    function randomString() {
                        return Math.floor(Math.random() * 36 ** 10).toString(36);
                    }
                    newM.location = `(detached):${randomString()}/${randomString()}`;
                }
                return [key, newM];
            });
        }
        return new Map([...filtered]);
    }

    modelUse(model, behavior) {
        let modelId = model.id;
        let array = this.modelUses.get(behavior);
        if (!array) {
            array = [];
            this.modelUses.set(behavior, array);
        }
        if (array.indexOf(modelId) < 0) {
            array.push(modelId);
            behavior.ensureBehavior();
            if (behavior.getCompiledBehavior().$behavior.setup) {
                behavior.invoke(model[isProxy] ? model._target : model, "setup");
            }
        }
    }

    modelUnuse(model, behavior) {
        let modelId = model.id;
        let array = this.modelUses.get(behavior);
        if (!array) {return;}
        let ind = array.indexOf(modelId);
        if (ind < 0) {return;}
        array.splice(ind, 1);
        let compiled = behavior.getCompiledBehavior();
        if (compiled && compiled.$behavior.teardown) {
            behavior.future(0).invoke(model[isProxy] ? model._target : model, "teardown");
        }
    }

    viewUse(model, behavior) {
        let modelId = model.id;
        let array = this.viewUses.get(behavior);
        if (!array) {
            array = [];
            this.viewUses.set(behavior, array);
        }
        if (array.indexOf(modelId) < 0) {
            array.push(modelId);
        }

        let {$behavior, $behaviorName} = behavior.ensureBehavior();
        if ($behavior.setup) {
            model.say("callSetup", `${behavior.module.externalName}$${$behaviorName}`);
        }
    }

    viewUnuse(model, behavior) {
        let modelId = model.id;
        let array = this.viewUses.get(behavior);
        if (!array) {return;}
        let ind = array.indexOf(modelId);
        if (ind < 0) {return;}
        array.splice(ind, 1);
        let compiled = behavior.getCompiledBehavior();
        if (compiled && compiled.$behavior.teardown) {
            model.say("callTeardown", `${behavior.module.externalName}$${compiled.$behaviorName}`);
        }
    }
}

BehaviorModelManager.register("BehaviorModelManager");

export class BehaviorViewManager extends ViewService {
    constructor(name) {
        super(name || "BehaviorViewManager");
        this.url = null;
        this.socket = null;
        this.status = false;
        this.model = this.wellKnownModel("BehaviorModelManager");
        this.subscribe(this.model.id, "callViewSetupAll", "callViewSetupAll");
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN && this.status === true;
    }

    destroy() {
        if (this.callback) {
            this.callback(false);
        }
        this.setURL(null);
        compiledBehaviors = new Map();
        super.destroy();
    }

    setURL(url, optCallback) {
        this.callback = optCallback;
        if (this.socket) {
            try {
                this.socket.onmessage = null;
                this.socket.close();
            } finally {
                this.socket = null;
            }
        }
        if (!url) {return;}
        this.url = url;
        this.socket = new WebSocket(url);
        this.socket.onmessage = (event) => this.load(event.data);

        this.socket.onopen = (_event) => {
            console.log("connected");
            this.status = true;
            if (this.callback) {
                this.callback(true);
            }
        };

        this.socket.onclose = (_event) => {
            console.log("disconnected");
            if (this.socket) {
                this.socket.onmessage = null;
                this.socket = null;
            }
            this.status = false;
            if (this.callback) {
                this.callback(false);
            }
        };
    }

    callViewSetupAll(pairs) {
        pairs.forEach((pair) => {
            let behavior = this.model.lookup(...pair);
            let viewUsers = this.model.viewUses.get(behavior);
            if (viewUsers) {
                viewUsers.forEach((modelId) => {
                    let pawn = GetPawn(modelId);
                    if (pawn) {
                        behavior.invoke(pawn, "setup");
                    }
                });
            }
        });
    }

    // This method receives content of changed behavior files.
    // first it creates a script DOM element with type="module", and sets its innerHTML to be the
    // dataURL of a file. In this way, the browser handles "export" in the behavior file,
    // and gives the exported object. We assign the export object into a global variable.
    // The contents of the global variable is then stored into CodeLibrary and the entire result is sent
    // to the corresponding BehaviorModelManager to update the model data.
    load(string) {
        let array;
        try {
            array = JSON.parse(string);
        } catch(e) {
            console.error(e);
            return;
        }
        if (!array || !Array.isArray(array)) {
            console.log("not an array");
            return;
        }

        let systemModuleMap = new Map();

        let promises = [];

        if (!window._allResolvers) {
            window._allResolvers = new Map();
        }

        let key = Date.now() + "_" + Math.random().toString();

        let current = new Map();

        window._allResolvers.set(key, current);

        array.forEach((obj) => {
            // {action, name, content, systemModule} = obj;
            if (obj.action === "add") {
                delete obj.action;
                systemModuleMap.set(obj.name, obj.systemModule);
                let modPromise = compileToModule(obj.content, obj.name)
                    .catch((e) => {console.log(e); return null;});
                promises.push(modPromise);
            }
        });

        Promise.all(promises).then(async (allData) => {
            allData = allData.filter((o) => o);
            if (allData.length === 0) {return;}

            // probably it needs to check if another loop is underway

            let library = new CodeLibrary();
            allData.forEach((obj) => {
                let dot = obj.name.lastIndexOf(".");
                let location = obj.name.slice(0, dot);
                let isSystem = obj.name.startsWith("croquet");

                if (!obj || checkModule(obj.data)) {
                    throw new Error("a behavior file does not export an array of modules");
                }

                library.add(obj.data.default, location, isSystem);
            });

            let sendBuffer = [];
            let key = Math.random();

            for (let [_k, m] of library.modules) {
                let {actorBehaviors, pawnBehaviors, name, location, systemModule} = m;
                sendBuffer.push({
                    name, systemModule, location,
                    actorBehaviors: [...actorBehaviors],
                    pawnBehaviors: [...pawnBehaviors]
                });
            };

            let string = JSON.stringify(sendBuffer);
            let array = new TextEncoder().encode(string);
            let ind = 0;

            this.publish(this.model.id, "loadStart", key);
            let throttle = array.length > 80000;

            while (ind < array.length) {
                let buf = array.slice(ind, ind + 2880);
                this.publish(this.model.id, "loadOne", {key, buf});
                ind += 2880;
                if (throttle) {
                    await new Promise((resolve) => {
                        setTimeout(resolve, 16);
                    });
                }
            }

            this.publish(this.model.id, "loadDone", key);
        });
    }
}

export class CodeLibrary {
    constructor() {
        this.modules = new Map(); // for behaviors
        // {name /*test/lights$Bar*/, {actorBehaviors: Map<name, codestring>, pawnBehaviors: Map<name, codestring>}, systemModule: boolean>, location:string?}

        this.functions = new Map();
        this.classes = new Map();
    }

    add(library, location, isSystem, language) {
        if (library.modules) {
            library.modules.forEach(module => {
                let {name, actorBehaviors, pawnBehaviors} = module;
                let actors = new Map();
                let pawns = new Map();
                if (actorBehaviors) {
                    actorBehaviors.forEach((cls) => {
                        actors.set(cls.name, cls.toString());
                    });
                }
                if (pawnBehaviors) {
                    pawnBehaviors.forEach((cls) => {
                        pawns.set(cls.name, cls.toString());
                    });
                }
                let pathName = `${location}$${name}`;
                let already = this.modules.get(pathName);
                if (already) {
                    console.log(`a module ${name} is defined in ${location} and ${already.location}`);
                }
                this.modules.set(pathName, {
                    name,
                    location,
                    actorBehaviors: actors,
                    pawnBehaviors: pawns,
                    systemModule: isSystem,
                    language: language
                });
            });
        }

        if (library.functions) {
            library.functions.forEach(f => {
                let key = f.name;
                let str = `return ${f.toString()};`;
                this.functions.set(key, str);
            });
        }

        if (library.classes) {
            library.classes.forEach(cls => {
                let key = cls.name;
                this.classes.set(key, cls);
            });
        }
    }

    addModules(map) {
        if (!map) {return;}
        for (let [k, v] of map) {
            this.modules.set(k, v);
        }
    }

    get(path) {
        return this.modules.get(path);
    }

    delete(path) {
        this.modules.delete(path);
    }
}

export function checkModule(module) {
    if (!module || !module.default || !module.default.modules) {
        throw new Error("a behavior file does not export an array of modules");
    }

    let list = module.default.modules;
    if (!Array.isArray(list)) {
        throw new Error("a behavior file does not export an array of modules");
    }
    list.forEach((m) => {
        let valid = true;
        if (!m.name) {valid = false;}
        if (m.actorBehaviors && !Array.isArray(m.actorBehaviors)) {valid = false;}
        if (m.pawnBehaviors && !Array.isArray(m.pawnBehaviors)) {valid = false;}
        let keys = {...m};
        delete keys.name;
        delete keys.actorBehaviors;
        delete keys.pawnBehaviors;
        if (Object.keys(keys).length > 0) {
            valid = false;
        }
        if (!valid) {
            throw new Error("a behavior file exports a malformed behavior module");
        }
    });
}

export async function compileToModule(text, path) {
    let language = path.endsWith(".ts") ? "ts" : "js";

    let jsCompiler;
    let tsCompiler;

    jsCompiler = new JSCompiler();
    let js = await jsCompiler.compile(text, path);

    if (language === "ts") {
        tsCompiler = new TSCompiler();
        js = await tsCompiler.compile(js, path);
    }

    let dataURL = URL.createObjectURL(new Blob([js], {type: "application/javascript"}));
    return eval(`import("${dataURL}")`).then((mod) => {
        return {name: path, data: mod};
    }).finally(() => {
        URL.revokeObjectURL(dataURL);
    });
}
