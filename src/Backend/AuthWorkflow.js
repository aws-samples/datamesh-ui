import { Auth } from "aws-amplify";

const axios = require("axios").default;
const cfnOutput = require("../cfn-output.json")

const AuthWorkflow = {
    async exec(stateMachineArn, input, domainId) {
        const apiUrl = `${cfnOutput.InfraStack.WorkflowApiUrl}/workflow/exec`
        const session = await Auth.currentSession()

        await axios({
            method: "POST",
            url: apiUrl,
            headers: {
                "Authorization": session.getAccessToken().getJwtToken(),
                "Content-Type": "application/json"
            },
            data: {stateMachineArn, input, domainId}
        })
    },
}

export default AuthWorkflow