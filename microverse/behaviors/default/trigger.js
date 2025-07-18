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
        console.log(this.id, "startTranscription", "startTranscription");
        this.subscribe(this.id, "startTranscription", "startTranscription");
    }

    startAudioContext(audioContext) {
        if (!window.renkonPromise) {
            window.renkonPromise = import("/assets/toolcall/renkon-core.js");
        }
        window.renkonPromise.then((renkon) => {
            this.renkon = renkon;
            this.programState = new renkon.ProgramState(Date.now(), this);
            window.programState = this.programState;
            fetch("/assets/toolcall/chatGPT-demo.renkon").then((resp) => resp.text()).then((result) => {
                const index = result.indexOf("{__codeMap: true, value:");
                let code;
                let data1 = JSON.parse(result.slice(0, index));
                let map = new Map();
                if (data1?.windowEnabled?.map?.values) {
                    map = new Map(data1?.windowEnabled?.map?.values);
                }
                const data2 = result.slice(index);
                const array = eval("(" + data2 + ")");
                code = array.value;
                code = code.filter((pair) => (!map.get(pair[0]) || map.get(pair[0]).enabled));
                programState.setupProgram(code.map((pair) => pair[1]), "chatGPT");
                programState.evaluator(Date.now());
            });
        }).catch((err) => {
            console.error(`${docName} could not be loaded`);
        });
    }

    startTranscription(id) {
        if (!this.programState) {return;}
        this.programState.registerEvent("click", id);
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
