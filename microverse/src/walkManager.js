import {ViewService} from "./worldcore";

export class WalkManager extends ViewService {
    constructor(name) {
        super(name || "WalkManager");
        this.walkers = [];
    }

    setupDefaultWalkers() {
        [
            ["BuiltinWalker", "WalkerPawn", "checkPortal"],
            ["BuiltinWalker", "WalkerPawn", "backoutFromFall"],
            ["BuiltinWalker", "WalkerPawn", "bvh"]
        ].forEach((spec) => this.append(spec));
    }

    append(walkerSpec) {
        // [ModuleName, BehaviorName, methodName]

        if (walkerSpec.length !== 3) {
            throw new Error(`walker spec should be in the form of "[ModuleName, BehaviorName, methodName]"`);
        }
        this.walkers.push(walkerSpec);
    }

    insertBefore(walkerSpec, prevSpec) {
        if (!prevSpec) {
            return this.append(walkerSpec);
        }

        let index = this.findIndex(prevSpec);
        if (index >= 0) {
            if (walkerSpec.length !== 3) {
                throw new Error(`walker spec should be in the form of "[ModuleName, BehaviorName, methodName]"`);
            }
            this.walkers.splice(index, 0, walkerSpec);
        }
    }

    remove(walkerSpec) {
        let index = this.findIndex(walkerSpec);
        if (index >= 0) {
            this.walkers.splice(index, 1);
        }
    }

    findIndex(walkerSpec) {
        let w = walkerSpec;
        return this.walkers.findIndex((a) => a[0] === w[0] && a[1] === w[1] && a[2] === w[2]);
    }

    removeAll() {
        this.walkers = [];
    }

    walk(avatar, vq, time, delta) {
        for (let i = 0; i < this.walkers.length; i++) {
            let walker = this.walkers[i];
            let behavior = avatar.actor.behaviorManager.lookup(walker[0], walker[1]);
            let [newVq, isFinal] = behavior.invoke(avatar, walker[2], vq, time, delta);
            if (isFinal) {
                return newVq;
            }
            vq = newVq;
        }
        return vq;
    }
}
