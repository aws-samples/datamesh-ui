import { Auth } from "aws-amplify";

const axios = require("axios").default;
const cfnOutput = require("../cfn-output.json")

const Event = {
    async getDetails() {
        const apiUrl = `${cfnOutput.InfraStack.WorkflowApiUrl}/event/details`
        const session = await Auth.currentSession()
        const {data} = await axios({
            method: "GET",
            url: apiUrl,
            headers: {
                "Authorization": session.getAccessToken().getJwtToken(),
                "Content-Type": "application/json"
            }
        })

        return data
    }
}

export default Event