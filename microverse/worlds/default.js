// Copyright 2022 by Croquet Corporation, Inc. All Rights Reserved.
// https://croquet.io
// info@croquet.io

export function init(Constants) {
    Constants.AvatarNames = ["newwhite"];

    /* Alternatively, you can specify a card spec for an avatar,
       instead of a string for the partical file name, to create your own avatar.
       You can add behaviorModules here. Also, if the system detects a behavior module
       named AvatarEventHandler, that is automatically installed to the avatar.
        {
            type: "3d",
            modelType: "glb",
            name: "rabbit",
            dataLocation: "./assets/avatars/newwhite.zip",
            dataRotation: [0, Math.PI, 0],
            dataScale: [0.3, 0.3, 0.3],
        }
    */

    Constants.UserBehaviorDirectory = "behaviors/default";
    Constants.UserBehaviorModules = [
        "lights.js", "toolcall.js", "trigger.js", "textCommandInterpreter.js", "menu.js"
    ];

    Constants.DefaultCards = [
        {
            card: {
                name:"world model",
                layers: ["walk"],
                type: "3d",
                singleSided: true,
                shadow: true,
                behaviorModules: ["ToolCallWorld", "AudioMenu"],
                translation:[0, -1.7, 0],
                placeholder: true,
                placeholderSize: [400, 0.1, 400],
                placeholderColor: 0xe0e0e0,
                placeholderOffset: [0, 0, 0],
            }
        },
        {
            card: {
                name: "light",
                layers: ["light"],
                type: "lighting",
                behaviorModules: ["Light"],
                dataLocation: "3OF2-s4U1ZOJduGATmLEIXo1iTkQHd5ZBknKgL5SvqpQJzs7Pzx1YGApJiMqPGE6PGEsPSA-Oio7YSYgYDpgCCsZLTYjBjwOJB4sDRcrfAg3Ljk2OBoEGBYWfWAmIGEsPSA-Oio7YSImLD0gOSo9PCpgPwB9AAIIISx8YiYneScqKyQaIisNLHkaGT8YKg56JQwQfHstPiNiGQ49e2ArLjsuYCMBPgMiCQt3OQskGhcleSp9HQIIfXseHgo7EAo9CB48FRwpegsCLH4OIwY",
                fileName: "/abandoned_parking_4k.jpg",
                dataType: "jpg",
                toneMappingExposure: 1.2
            }
        },
        {
            card: {
                name: "editor owner",
                translation: [5.5, 0.4, -16.87],
                type: "object"
            },
            id: "editor owner",
        },
        {
            card: {
                name: "tool call switch",
                translation: [0, 0.5, 0],
                behaviorModules: ["ToolCallTrigger"],
                type: "object",
                parent: "editor owner",
            }
        },
        {
            card: {
                name: "text editor",
                className: "TextFieldActor",
                parent: "editor owner",
                translation: [0, -0.5, 0],
                rotation: [0, 0, 0],
                depth: 0.05,
                type: "text",
                runs: [{text: "\nWelcome to the Croquet Gallery!\nThis is connected to the substrate OS\nthat can detect voice commands.\nIt can handle move the cursor down for example"}],
                margins: {left: 20, top: 20, right: 20, bottom: 20},
                backgroundColor: 0xc4a836,
                color: 0x000000,
                fullBright: true,
                behaviorModules: ["TextCommandInterpreter"],
                //color: 0xf4e056,
                width: 2,
                height: 2,
                textScale: 0.002,
                shadow: true,
            }
        }
    ];
}
