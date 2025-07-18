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
        console.log("editCommand", data);
        if (!data) {return;}
        let command = data.name;
        let args = JSON.parse(data.arguments);
        if (!command) return;

        let user = this.user;

        if (command === "cursorNextLine") {
            let arg = args.arg;
            this.warota.handleKey(user, 40, false, false, arg);
            this.changed(true); // this calls "changed" of TextFieldPawn
        }
        if (command === "cursorPrevLine") {
            let arg = args.arg;
            this.warota.handleKey(user, 38, false, false, arg);
            this.changed(true); // this calls "changed" of TextFieldPawn
        }
        if (command === "deleteSelection") {
            this.warota.delete(user, true);
            this.changed(true); // this calls "changed" of TextFieldPawn
        }
        if (command === "typeIn") {
            let arg = args.arg;
            this.warota.insert(user, [{text: arg}]);
            this.changed(true); // this calls "changed" of TextFieldPawn
        }
        if (command === "searchFor") {
            let arg = args.arg;
            let selection = this.warota.doc.selections[user];
            let text = this.warota.doc.plainText();
            const index = text.indexOf(arg, selection ? selection.end : 0);
            if (index > 0) {
                this.warota.select(user, index, index + arg.length, false);
                this.changed(true); // this calls "changed" of TextFieldPawn
            }
        }
        if (command === "replaceAll") {
            let original = args.original;
            let replacement = args.replacement;

            let text = this.warota.doc.plainText();

            let newText = text.replaceAll(original, replacement);
            this.say("load", [{text: newText}]);
            this.changed(true); // this calls "changed" of TextFieldPawn
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
