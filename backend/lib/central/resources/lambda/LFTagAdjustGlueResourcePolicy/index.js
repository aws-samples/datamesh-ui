const AWS = require("aws-sdk")
const util = require("util");

exports.handler = async(event) => {
    const accountId = event.accountId;
    const accountIdRootArn = util.format("arn:aws:iam::%s:root", accountId);

    const glue = new AWS.Glue();

    const resourcePolicyResp = await glue.getResourcePolicy().promise();

    let resourcePolicy = JSON.parse(resourcePolicyResp.PolicyInJson);
    let statements = resourcePolicy.Statement;

    let policyDocument = statements.find(row => row.Condition && row.Condition.Bool && row.Condition.Bool["glue:EvaluatedByLakeFormationTags"] == "true");
    let ramPolicyDocument = statements.find(row => row.Principal.Service && row.Principal.Service == "ram.amazonaws.com");

    if (policyDocument) {
        const newPrincipals = new Set();
        newPrincipals.add(accountIdRootArn);

        if (Array.isArray(policyDocument.Principal.AWS)) {
            policyDocument.Principal.AWS.forEach(item => newPrincipals.add(item));
        } else {
            newPrincipals.add(policyDocument.Principal.AWS)
        }

        const arrNewPrincipals = Array.from(newPrincipals);

        policyDocument.Principal.AWS = arrNewPrincipals;

        resourcePolicy.Statement = [
            policyDocument
        ]

        if (ramPolicyDocument) {
            resourcePolicy.Statement.push(ramPolicyDocument);
        }

        await glue.putResourcePolicy({
            PolicyInJson: JSON.stringify(resourcePolicy),
            EnableHybrid: "TRUE"
        }).promise();
    }
}