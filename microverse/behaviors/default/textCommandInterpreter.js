// the following import statement is solely for the type checking and
// autocompletion features in IDE.  A Behavior cannot inherit from
// another behavior or a base class but can use the methods and
// properties of the card to which it is installed.
// The prototype classes ActorBehavior and PawnBehavior provide
// the features defined at the card object.

import {ActorBehavior} from "../PrototypeBehavior";

class TextCommandInterpreterPawn extends PawnBehavior {
    setup() {
        this.subscribe(this.id, "editCommand", "editCommand");
        console.log("TextCommandInterpreterPawn");
    }

    editCommand(data) {
        let command = data.value;
        if (!command) return;

        let user = this.user;

        if (command.command === "cursor_next_line") {
            let nLines = command.parameters["nLines"];
            this.warota.handleKey(user, 40, false, false, nLines);
            this.warota.layout();

            this.changed(true); // you can call changed of TextFieldPawn
        }
        if (command.command === "type_in") {
            this.warota
        }
    }
}

export default {
    modules: [
        {
            name: "TextCommandInterpreter",
            pawnBehaviors: [TextCommandInterpreterPawn]
        }
    ]
}

