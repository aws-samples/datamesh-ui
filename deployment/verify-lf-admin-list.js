#!/usr/bin/env node
const profileName = process.argv[2]
const region = process.argv[3]
const {fromIni} = require("@aws-sdk/credential-provider-ini")
const {LakeFormationClient, GetDataLakeSettingsCommand, PutDataLakeSettingsCommand} = require("@aws-sdk/client-lakeformation")
const {SFNClient, ListStateMachinesCommand, DescribeStateMachineCommand} = require("@aws-sdk/client-sfn")

const clientParams = {
    credentials: fromIni({profile: profileName}),
    region: region
}

const lfClient = new LakeFormationClient(clientParams)
const sfnClient = new SFNClient(clientParams)
let dataLakeSettings = null
let missing = null

const verifyCentral = async() => {
    dataLakeSettings = await lfClient.send(new GetDataLakeSettingsCommand({}))
    const cdkOutput = require(__dirname+"/../backend/central-output.json");
    const lfAdminList = JSON.parse(cdkOutput.DataMeshUICentralStack.LFAdminList)
    const actualList = dataLakeSettings.DataLakeSettings.DataLakeAdmins.map(x => x.DataLakePrincipalIdentifier)
    missing = lfAdminList.filter(x => !actualList.includes(x))
    console.log(`Missing Count: ${missing.length}`)
    await updateConfiguration()
}

const verifyCustomer = async() => {
    dataLakeSettings = await lfClient.send(new GetDataLakeSettingsCommand({}))
    const listOfStateMachines = await sfnClient.send(new ListStateMachinesCommand({maxResults: 1}))
    const stateMachineArn = listOfStateMachines.stateMachines[0].stateMachineArn

    const stateMachine = await sfnClient.send(new DescribeStateMachineCommand({stateMachineArn}))

    const lfAdminList = [stateMachine.roleArn]
    const actualList = dataLakeSettings.DataLakeSettings.DataLakeAdmins.map(x => x.DataLakePrincipalIdentifier)
    missing = lfAdminList.filter(x => !actualList.includes(x))
    console.log(`Missing Count: ${missing.length}`)
    await updateConfiguration()
}

const updateConfiguration = async() => {
    if (missing && missing.length > 0) {
        console.log("Updating LF Admin List")
        for (const roleArn of missing) {
            dataLakeSettings.DataLakeSettings.DataLakeAdmins.push({
                DataLakePrincipalIdentifier: roleArn
            })
        }

        await lfClient.send(new PutDataLakeSettingsCommand({DataLakeSettings: dataLakeSettings.DataLakeSettings}))
    }
}

if (profileName == "central") {
    console.log("Verifying Central")
    verifyCentral()
} else if (profileName == "customer") {
    console.log("Verifying Customer")
    verifyCustomer()
}