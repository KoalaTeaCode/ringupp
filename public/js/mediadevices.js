// https://webrtc.org/getting-started/media-devices
// https://www.twilio.com/blog/2018/04/choosing-cameras-javascript-mediadevices-api.html

// @TODO: Switching cameras

// Fetch an array of devices of a certain type
async function getConnectedDevices(type) {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(device => device.kind === type)
}

// Updates the select element with the provided set of cameras
function updateVideoInput(cameras) {
    const listElement = document.getElementById('availableVideoInput');
    listElement.innerHTML = '';
    let count = 1;
    cameras.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        const label = camera.label || `Video Input ${count++}`;
        const textNode = document.createTextNode(label);
        option.appendChild(textNode);
        listElement.appendChild(option);
    })
}

function updateAudioInputList(inputs) {
    const listElement = document.getElementById('availableAudioInput');
    listElement.innerHTML = '';
    let count = 1;
    inputs.forEach(camera => {
        const option = document.createElement('option');
        option.value = camera.deviceId;
        const label = camera.label || `Audio Input ${count++}`;
        const textNode = document.createTextNode(label);
        option.appendChild(textNode);
        listElement.appendChild(option);
    })
}

// TODO: Audio output doesn't work on all platforms so will need to look for a workaround if wanted
// function updateAudioOutputList(outputs) {
//     const listElement = document.getElementById('availableAudioOutput');
//     listElement.innerHTML = '';
//     let count = 1;
//     outputs.forEach(camera => {
//         const option = document.createElement('option');
//         option.value = camera.deviceId;
//         const label = camera.label || `Audio Output ${count++}`;
//         const textNode = document.createTextNode(label);
//         option.appendChild(textNode);
//         listElement.appendChild(option);
//     })
// }

// Listen for changes to media devices and update the list accordingly
navigator.mediaDevices.addEventListener('devicechange', async event => {
    reloadDeviceOptions()
});

function getVideoDeviceById(deviceId) {
    const constraints = { deviceId: { exact: deviceId } };
    return navigator.mediaDevices.getUserMedia({ video: constraints });
}

function getAudioDeviceById(deviceId) {
    const constraints = { deviceId: { exact: deviceId } };
    return navigator.mediaDevices.getUserMedia({ audio: constraints });
}

async function reloadDeviceOptions() {
    const videoCameras = await getConnectedDevices('videoinput');
    updateVideoInput(videoCameras);

    const audioInput = await getConnectedDevices('audioinput');
    updateAudioInputList(audioInput);

    // const audioOutput = await getConnectedDevices('audiooutput');
    // updateAudioOutputList(audioOutput);
}

async function init() {
    reloadDeviceOptions()
}

(async () => {
    init()
})().catch(err => {
    console.error(err);
});