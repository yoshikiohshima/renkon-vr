// Menus
// Croquet Microverse

// the following import statement is solely for the type checking and
// autocompletion features in IDE.  A Behavior cannot inherit from
// another behavior or a base class but can use the methods and
// properties of the card to which it is installed.
// The prototype classes ActorBehavior and PawnBehavior provide
// the features defined at the card object.

import {PawnBehavior} from "../PrototypeBehavior";

class AudioMenuPawn extends PawnBehavior {
    setup() {
        this.teardown();
        this.menuItems = [];
        this.installMenu("Start Audio", "#startAudio", () => {
            /*
              const r = new window.webkitSpeechRecognition();
            r.lang = 'en-US';
            r.continuous = false;
            */
            this.publish(this.id, "startAudioContext");
        });
    }

    installMenu(menuText, id, callback) {
        let menu = document.body.querySelector("#worldMenu");
        if (menu) {
            let item = menu.querySelector(id);
            if (item) {
                item.remove();
            }
            let menuItemDiv = document.createElement("div");
            menuItemDiv.innerHTML = 
                `<div id="${id}" class="menu-label menu-item">
                <div class="menu-icon"></div>
                <span class="menu-label-text">${menuText}</span>
                </div>`;
            let menuItem = menuItemDiv.firstChild;
            menuItem.addEventListener("click", callback);
            menu.appendChild(menuItem);

            this.menuItems.push(menuItem); // needs to be an array
        }
    }

    teardown() {
        if (!this.menuItems) {return;}
        this.menuItems.forEach((m) => m.remove());
        delete this.menuItems;
    }
}


export default {
    modules: [
        {
            name: "AudioMenu",
            pawnBehaviors: [AudioMenuPawn],
        }
    ]
}
