#!/usr/bin/env node
const fs = require("fs");
const fileLocation = process.argv[2];
const cdkOutput = require(__dirname+"/../"+fileLocation);

const newOutput = {"version": 1};
const stackOutput = cdkOutput.DataMeshUICentralStack;
let uiPayload = null;

for (const key in stackOutput) {
    if (key.indexOf("DataMeshUIUIPayload") != -1) {
        uiPayload = stackOutput[key];
    } else if (key.indexOf("DataMeshUIAuthClientId") != -1) {
        newOutput.webClientId = stackOutput[key];
        newOutput.nativeClientId = stackOutput[key];
    } else if (key.indexOf("DataMeshUIAuthUserPoolId") != -1) {
        newOutput.userPoolId = stackOutput[key];
    } else if (key.indexOf("DataMeshUIAuthIdentityPoolId") != -1) {
        newOutput.identityPoolId = stackOutput[key];
    }
}

if (uiPayload) {
    fs.writeFileSync(__dirname+"/../src/cfn-output.json", uiPayload);
}

process.stdout.write(JSON.stringify(newOutput));