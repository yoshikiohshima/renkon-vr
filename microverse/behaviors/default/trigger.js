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

    commandList() {
        return {
            cursor_next_line: {
                description: "Move the cursor to n lines down from the current line",
                meta: {
                    "#/data/parameters/nLines": {
                        type: "number",
                        description: "The amount of movement.",
                    },
                    "#/data/returns/ok": {
                        type: "boolean"
                    },
                }
            },
            type_in: {
                description: "Type in the argument at the current cursor position",
                meta: {
                    "#/data/parameters/input": {
                        type: "string",
                        description: "The string to be entered."
                    },
                    "#/data/returns/ok": {type: "boolean"}
                }
            }
        };
    }

    startAudioContext(audioContext) {
        if (!window.renkonPromise) {
            window.renkonPromise = import("/assets/toolcall/renkon-core.js");
        }
        window.renkonPromise.then((renkon) => {
            this.renkon = renkon;
            this.programState = new renkon.ProgramState(0);
            window.programState = this.programState;
            import("/assets/toolcall/toolcall.js").then((toolcall) => {
                this.programState.merge(toolcall.toolcall);
                this.programState.registerEvent("audioContextReceiver", audioContext);
                this.programState.registerEvent("commandListReceiver", this.commandList());

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
            if (this.programState.myOutput && this.programState.myOutput.length > 0) {
                this.output.push(...this.programState.myOutput);
                this.programState.myOutput = [];
                if (this.toolCallTarget) {
                    let output = [...this.output];
                    this.output = [];
                    this.toolCallTarget.call("ToolCallTrigger$ToolCallTriggerPawn", "processOutput", output);
                }
            }
        } catch(e) {
            console.log("error in renkon program execution");
            console.error(e);
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
