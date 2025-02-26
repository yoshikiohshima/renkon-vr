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

    const commandListReceiver = Events.receiver();
    const commandList = Behaviors.keep(commandListReceiver);
    console.log("commandList", commandList);

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
    const root = new ReflectCommands(hostName + "/substrate/v1/msgindex").reflect();
    const whisper = root["faster-whisper/transcribe-data"];

    const spaceRoot = new ReflectCommands(hostName).reflect();
    // const space = spaceRoot["spaces:new"].run();
    const space = {space_id: "sp-01JN1YG5AAMF7HMPF4B62KFQW5"};
    const spaceMsgindex = new ReflectCommands(hostName + `/spaceview;space=${space.space_id}/`).reflect();
    const spaceLinks = spaceMsgindex["links:query"].run();

    const storeHref = "/events;data=sp-01JN1Y1RM1F47MMJVGZ8HGE1CK/"
    // const storeHref = spaceLinks.links["eventstore"].href;
    const storeMsgindex = new ReflectCommands(hostName + storeHref).reflect();

    console.log("space", space);
    console.log("streamURL", `${hostName}/events;data=${space.space_id}/stream/events`);
    console.log("spaceMsgindex", spaceMsgindex);
    console.log("spaceLinks", spaceLinks);
    console.log("storeHref", storeHref);
    console.log("storeMsgIndex", storeMsgindex);

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
        console.log("processing commandResponse", commandResponse);
        const response = commandResponse.response;
        if (!response) {return;}
        if (response.choices[0]) {
            const result = response?.choices[0];
            const value = {command: result.command, parameters: result.parameters};
            if (!Renkon.myOutput) {
                Renkon.myOutput = [];
            }
            Renkon.myOutput.push({input: commandResponse.input, value});

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

    /*

    const transcribed = ((wav, whisper) => {
        const audio_data = toBase64(new Uint8Array(wav.wav));
        const audio_metadata = {mime_type: "audio/wav"};
        const task = "transcribe";
        return whisper.run({audio_data, audio_metadata, task});
        })(wav, whisper);

    */

    const writeWav = ((wav) => {
        console.log("writeWav", wav);
        const audio_data = toBase64(new Uint8Array(wav.wav));
        const audio_metadata = {mime_type: "audio/wav"};
        const task = "transcribe";
        storeMsgindex["events:write"].run({events: [{audio_data, audio_metadata, task}]});
    })(wav);
                    
    // console.log("transcribed", transcribed);

    const words = ((transcribed) => {
        const result = [];
        transcribed.segments.forEach((seg) => {
            seg.words.forEach((word) => result.push(word.word));
        });
        return result;
    })(transcribed);

    const writeEvents = (...events)  => {
        console.log("writeEvents", events);
        storeMsgindex["events:write"].run({events});
    };

    const myWrite = writeEvents({
        fields: {
            path: "/rules/defs/transcribe_wav",
            conditions: [
                { compare: { type: [{compare: "=", value: "audio/wav"}] } }
            ],
            command: {
                data: {
                    command_url: "http://substrate:8080/substrate/v1/msgindex",
                    command: "faster-whisper/transcribe-data",
                },
                meta: {
                    "#/data/parameters/events": {"type": "any"},
                },
                msg_in: {
                    "#/msg/data/parameters/arguments/0/events": "#/data/parameters/events",
                    "#/msg/data/parameters/arguments/0/command_url": "#/data/command_url",
                    "#/msg/data/parameters/arguments/0/command": "#/data/command",
                },
                msg_out: {
                    "#/data/returns/next": "#/msg/data/returns/result/next",
                },
                msg: {
                    cap: "reflect",
                    data: {
                        url: "/quickjs/",
                        name: "eval",
                        parameters: {
                            source: `
                function ({events, command_url, command}) {
                  return {
                    next: events.map((evt) => {
                      let {base64} = evt.fields;
                      const transcribed = reflector.run(command_url, command, {
                        audio_data: base64,
                        audio_metadata: {mime_type: "audio/wav"}
                        task: "transcribe"
                      });
                      return {
                        fields: {
                           ...transcribed,
                          links: {
                            source: {
                              rel: "eventref",
                              attributes: {
                                "eventref:event": evt.id
                              }
                            },
                          },
                        }
                      };
                    })
                  }
                }
              `,
                        }
                    }
                }
            }
        }
    });

    const input = Events.change(words.join(" "));
    console.log("words", words);
    console.log("input", input);
    return [];
}
