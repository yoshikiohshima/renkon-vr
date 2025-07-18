// the following import statement is solely for the type checking and
// autocompletion features in IDE.  A Behavior cannot inherit from
// another behavior or a base class but can use the methods and
// properties of the card to which it is installed.
// The prototype classes ActorBehavior and PawnBehavior provide
// the features defined at the card object.

import {PawnBehavior} from "../PrototypeBehavior";

class ToolCallTriggerPawn extends PawnBehavior {
    setup() {
        let cards = this.actor.queryCards();
        let textField = [...this.actor.parent.children][1];
        this.textField = Microverse.GetPawn(textField.id);
        let world = cards.find((c) => c._name === "world model");
        this.triggerWorld = Microverse.GetPawn(world.id);
        this.addEventListener("pointerDown", "onPointerDown");
        this.addEventListener("pointerUp", "onPointerUp");
        console.log(this.id, "functionCall", "functionCall");
        this.subscribe(this.id, "functionCall", "functionCall");
        this.makeButton();
    }

    functionCall(data) {
        this.textField.publish(this.textField.id, "editCommand", data);
    }

    onPointerDown(p3d) {
        let avatar = this.getMyAvatar();
        this.triggerWorld.toolCallTarget = this;
        let text = this.textField.actor.doc.plainText();
        console.log("toolCallTarget", this.triggerWorld, text);
        avatar.addFirstResponder("pointerUp", {}, this);
        this.publish(this.triggerWorld.id, "startTranscription", {id: this.id, text});
    }

    onPointerUp(p3d) {
        let avatar = this.getMyAvatar();
        avatar.removeFirstResponder("pointerUp", {}, this);
    }

    setColor() {
        let baseColor = !this.actor.hasOpened
            ? (this.entered ? 0xeeeeee : 0xcccccc)
            : 0x22ff22;

        if (this.shape.children[0] && this.shape.children[0].material) {
            this.shape.children[0].material.color.setHex(baseColor);
        }
    }

    makeButton() {
        [...this.shape.children].forEach((c) => this.shape.remove(c));

        let geometry = new Microverse.THREE.SphereGeometry(0.15, 16, 16);
        let material = new Microverse.THREE.MeshStandardMaterial({color: 0xcccccc, metalness: 0.8});
        let button = new Microverse.THREE.Mesh(geometry, material);
        this.shape.add(button);
        this.setColor();
    }

    hilite() {
        this.entered = true;
        this.setColor();
    }

    unhilite() {
        this.entered = false;
        this.setColor();
    }
}

export default {
    modules: [
        {
            name: "ToolCallTrigger",
            pawnBehaviors: [ToolCallTriggerPawn]
        }
    ]
}

/* globals Microverse */
