// the following import statement is solely for the type checking and
// autocompletion features in IDE.  A Behavior cannot inherit from
// another behavior or a base class but can use the methods and
// properties of the card to which it is installed.
// The prototype classes ActorBehavior and PawnBehavior provide
// the features defined at the card object.

import {PawnBehavior} from "../PrototypeBehavior";

class ToolCallPawn extends PawnBehavior {
    setup() {
        if (!window.renkonPromise) {
            window.renkonPromise = import("/assets/toolcall/renkon-core.js");
        }

        window.renkonPromise.then((renkon) => {
            this.renkon = renkon;
            this.programState = new renkon.ProgramState(0);
            import("/assets/toolcall/toolcall.js").then((toolcall) => {
                this.programState.merge(toolcall.toolcall);
                this.startTime = Date.now();
                let moduleName = this._behavior.module.externalName;
                this.addUpdateRequest([`${moduleName}$ToolCallPawn`, "update"]);
            });
        });
    }

    teardown() {
        let moduleName = this._behavior.module.externalName;
        this.removeUpdateRequest([`${moduleName}$ToolCallPawn`, "update"]);
    }

    update() {
        if (!this.programState) {return;}
        this.programState.evaluate(Date.now() - this.startTime);
    }
}

export default {
    modules: [
        {
            name: "ToolCall",
            pawnBehaviors: [ToolCallPawn]
        }
    ]
}

/* globals Microverse */
