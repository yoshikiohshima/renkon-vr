class VisualizerProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.id = 0;
    }

    process(inputs, outputs, _parameters) {
        const input = inputs[0];
        let max = 0;
        if (!input[0]) {
            console.log("no input");
            return true;
        }
        for (let i = 0; i < input[0].length; i++) {
            max = Math.abs(input[0][i]) > max ? Math.abs(input[0][i]) : max;
        }
        outputs[0][0].set(input[0], 0);
        this.port.postMessage({id: this.id, input, max});
        this.id++;
        return true;
    }
}

registerProcessor('processor', VisualizerProcessor);
