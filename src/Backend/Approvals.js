import { Auth } from "aws-amplify";

const axios = require("axios").default;
const cfnOutput = require("../cfn-output.json")

const Approvals = {
    async getPendingApprovals() {
        const apiUrl = `${cfnOutput.InfraStack.WorkflowApiUrl}/data-domains/pending-approvals`
        const session = await Auth.currentSession()
        const {data} = await axios({
            method: "GET",
            url: apiUrl,
            headers: {
                "Authorization": session.getAccessToken().getJwtToken()
            }
        })

        return data.pendingApprovals
    },
    async getPendingApprovalCount() {
        const apiUrl = `${cfnOutput.InfraStack.WorkflowApiUrl}/data-domains/pending-approval-count`
        const session = await Auth.currentSession()
        const {data} = await axios({
            method: "GET",
            url: apiUrl,
            headers: {
                "Authorization": session.getAccessToken().getJwtToken()
            }
        })

        return data.pendingCount
    },
    async processApproval(sourceAccountId, requestIdentifier, actionType) {
        const apiUrl = `${cfnOutput.InfraStack.WorkflowApiUrl}/data-domains/process-approval`
        const session = await Auth.currentSession()
        const {data} = await axios({
            method: "POST",
            url: apiUrl,
            headers: {
                "Authorization": session.getAccessToken().getJwtToken()
            },
            data: {
                sourceAccountId,
                requestIdentifier,
                actionType
            }
        })

        return data
    }
}

export default Approvals