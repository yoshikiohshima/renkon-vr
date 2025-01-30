export function toolcall() {
    const hostName = (() => {
        const maybeHost = new URL(window.location).searchParams.get("host")
        if (maybeHost) {
            return maybeHost;
        }
        return "/";
    })();

    const {toBase64} = import("./media/toBase64.js");
    const localMediaModule = import("./media/localmedia.js");
    const {audioBufferToWav} = import("./media/wav.js");
                
    const {h, render, html} = import(Renkon.spaceURL("./preact.standalone.module.js"));
    const {ReflectCommands} = import(`${hostName}/tool-call/js/commands.js`);

    /*
    const trigger = Events.observe((notifier) => {
        const handler = (event) => {
            notifier(event);
            document.body.removeEventListener("click", handler);
        };
        document.body.addEventListener("click", handler);
        return () => document.body.removeEventListener("click", handler);
        });
    */

    const audioContextReceiver = Events.receiver();

    const audioContext = Behaviors.keep(audioContextReceiver);

    const localMedia = new localMediaModule.LocalMedia({
        videoSource: false,
        onstreamchange: (stream) => {
        }
    });

    const streams = localMedia.setup();

    const source = ((audioContext, localMedia, _streams) => {
        console.log("in source", audioContext, localMedia);
        return new window.MediaStreamAudioSourceNode(audioContext, {mediaStream: localMedia.stream})
    })(audioContext, localMedia, streams);

    const processor = ((audioContext) => {
        return audioContext.audioWorklet.addModule(`/assets/toolcall/media/audio-samples.js`).then(() => {
            const worklet = new window.AudioWorkletNode(audioContext, "processor");
            worklet.addEventListener("processorerror", console.log);
            return worklet;
        })
    })(audioContext);

    const inputs = Events.observe((notifier) => {
        processor.port.onmessage = (event) => {
            if (!window.toolCallDown) {return;}
            notifier(event.data);
        }
        source.connect(processor);
        return () => source.disconnect(processor);
    }, {queued: true});

    const voiceChunk = Events.receiver();

    console.log("voiceChunk", voiceChunk);

    const speaking = Behaviors.collect({time: 0, data: [], speaking: false}, inputs, ((old, current) => {
        const max = Math.max(...current.map((c) => c.max));
        const currentTime = current[current.length - 1].currentTime;
        const newInput = current.map((c) => c.input);

        if (old.speaking) {
            const newData = [...old.data, ...newInput];
            if (max < 0.01) {
                if (currentTime > old.time + 0.5) {
                    if (window.toolCallDown) {
                        Events.send(voiceChunk, {time: currentTime, data: newData});
                    }
                    return {time: currentTime, data: newData, speaking: false};
                }
                return {time: old.time, data: newData, speaking: old.speaking};
            }
            return {time: currentTime, data: newData, speaking: old.speaking};
        }

        if (max < 0.01) {
            return old;
        }

        const newData = newInput;
        return {time: currentTime, data: newInput, speaking: true};
    }));

    const toolCall = new ReflectCommands(hostName + "/tool-call").reflect();
    const root = new ReflectCommands(hostName + "/").reflect();
    const whisper = root["faster-whisper:transcribe-data"];

    const commandList = {
        cursor_next_line: {
            description: "Move the cursor to n lines down the current line",
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

    const commandResponseFromCommand = ((toolCall, commandList, input) => {
        console.log("toolCall", input);
        const cmd = toolCall["suggest"];
        if (!cmd) {return;}

        const response = cmd.run({commands: commandList, input}).catch((e) => {
            console.log("tool-call error: ", e);
            return;
        });
        return {response, input};
    })(toolCall, commandList, input);

    const commandResponse = Events.resolvePart(commandResponseFromCommand.response, commandResponseFromCommand);

    ((commandResponse) => {
        const response = commandResponse.response;
        if (response.choices[0]) {
            const result = response?.choices[0];
            const value = {command: result.command, parameters: result.parameters};
            if (!Renkon.myOutput) {
                Renkon.myOutput = [];
            }
            Renkon.myOutput.push({input, value});

            /*
            const renkon = document.querySelector("#renkon");
            const input = document.createElement("div");
            const div = document.createElement("div");
            const br = document.createElement("br");

            input.textContent = commandResponse.input;
            div.textContent = str;
            
            renkon.appendChild(input);
            renkon.appendChild(div);
            renkon.appendChild(br);
            */
        }
    })(commandResponse);

    const wav = ((voiceChunk) => {
        const zip = (pairs) => {
            const length = pairs[0][0].length * pairs.length;
            const a = new Float32Array(length);
            const b = new Float32Array(length);
            let index = 0;
            for (let i = 0; i < pairs.length; i++) {
                a.set(pairs[i][0], index);
                b.set(pairs[i][1], index);
                index += pairs[i][0].length;
            }
            return [a, b];
        }
        return {timelabel: voiceChunk.time, wav: audioBufferToWav(44100, zip(voiceChunk.data))};
    })(voiceChunk);

    /*
      const saveWav = ((wav) => {
      let div = document.createElement("a");
      const blob = new Blob([wav.wav], {type: "audio/wav"});
      let fileURL = URL.createObjectURL(blob);
      div.setAttribute("href", fileURL);
      div.setAttribute("download", `wav-${Date.now()}.wav`);
      div.click();
      })(wav);
    */

    const transcribed = ((wav, whisper) => {
        const audio_data = toBase64(new Uint8Array(wav.wav));
        const audio_metadata = {mime_type: "audio/wav"};
        const task = "transcribe";
        return whisper.run({audio_data, audio_metadata, task});
    })(wav, whisper);
                    
    console.log("transcribed", transcribed);

    const words = ((transcribed) => {
        const result = [];
        transcribed.segments.forEach((seg) => {
            seg.words.forEach((word) => result.push(word.word));
        });
        return result;
    })(transcribed);

    const input = words.length > 3 ? words.join(" ") : undefined;
    console.log("words", words);
    return [];
}
