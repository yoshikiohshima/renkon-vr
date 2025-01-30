// the following import statement is solely for the type checking and
// autocompletion features in IDE.  A Behavior cannot inherit from
// another behavior or a base class but can use the methods and
// properties of the card to which it is installed.
// The prototype classes ActorBehavior and PawnBehavior provide
// the features defined at the card object.

import {PawnBehavior} from "../PrototypeBehavior";

class ToolCallWorldPawn extends PawnBehavior {
    setup() {
        this.output = [];
        this.subscribe(this.id, "startAudioContext", "startAudioContext");
    }

    startAudioContext(audioContext) {
        if (!window.renkonPromise) {
            window.renkonPromise = import("/assets/toolcall/renkon-core.js");
        }
        window.renkonPromise.then((renkon) => {
            this.renkon = renkon;
            this.programState = new renkon.ProgramState(0);
            import("/assets/toolcall/toolcall.js").then((toolcall) => {
                this.programState.merge(toolcall.toolcall);
                this.programState.registerEvent("audioContextReceiver", audioContext);
                this.startTime = Date.now();
                this.lastTime = this.startTime;
                let moduleName = this._behavior.module.externalName;
                this.addUpdateRequest([`${moduleName}$ToolCallWorldPawn`, "update"]);
            });
        });
    }

    teardown() {
        let moduleName = this._behavior.module.externalName;
        this.removeUpdateRequest([`${moduleName}$ToolCallWorldPawn`, "update"]);
        delete window.toolCallDown;
        console.log("delete window.toolCallDown;");
    }

    update() {
        if (!this.programState) {return;}
        const now = Date.now();
        if (now - this.lastTime < 16) {return;}
        try {
            this.programState.evaluate(now - this.startTime);
            if (this.programState.myOutput.length > 0) {
                this.output.push(...this.programState.myOutput);
                this.programState.myOutput = [];
                if (this.toolCallTarget) {
                    let output = [...this.output];
                    this.output = [];
                    this.toolCallTarget.call("ToolCallTrigger$ToolCallTriggerPawn", "processOutput", output);
                }
            }
        } catch(e) {
        }

        this.lastTime = now;
    }
}

export default {
    modules: [
        {
            name: "ToolCallWorld",
            pawnBehaviors: [ToolCallWorldPawn],
        }
    ]
}

/* globals Microverse */
