const AWS = require("aws-sdk")
const util = require("util");

const POLICY_VERSION = "2012-10-17"

exports.handler = async(event, context) => {
    const accountId = event.accountId;
    const accountIdRootArn = util.format("arn:aws:iam::%s:root", accountId);

    const glue = new AWS.Glue();

    
    const functionArn = context.invokedFunctionArn
    const functionArnTokenized = functionArn.split(":")
    const functionRegion = functionArnTokenized[3]
    const functionAccountId = functionArnTokenized[4]
    let resourcePolicyResp = null
    let resourcePolicy = null

    try {
        resourcePolicyResp = await glue.getResourcePolicy().promise();
        resourcePolicy = JSON.parse(resourcePolicyResp.PolicyInJson);
    } catch (e) {
        resourcePolicy = {
            Version: POLICY_VERSION,
            Statement: []
        }
    }

    let statements = resourcePolicy.Statement;

    let policyDocument = statements.find(row => row.Condition && row.Condition.Bool && row.Condition.Bool["glue:EvaluatedByLakeFormationTags"] == "true");
    let ramPolicyDocument = statements.find(row => row.Principal.Service && row.Principal.Service == "ram.amazonaws.com");

    resourcePolicy.Statement = []

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
    } else {
        policyDocument = {
            Effect: "Allow",
            Principal: {
                AWS: [accountIdRootArn]
            },
            Action: "glue:*",
            Resource: [
                `arn:aws:glue:${functionRegion}:${functionAccountId}:table/*`,
                `arn:aws:glue:${functionRegion}:${functionAccountId}:database/*`,
                `arn:aws:glue:${functionRegion}:${functionAccountId}:catalog`
            ],
            "Condition": {
                "Bool": {
                  "glue:EvaluatedByLakeFormationTags": "true"
                }
            }
        }
    }

    resourcePolicy.Statement.push(policyDocument)

    if (!ramPolicyDocument) {
        resourcePolicy.Statement.push({
            "Effect": "Allow",
            "Principal": {
              "Service": "ram.amazonaws.com"
            },
            "Action": "glue:ShareResource",
            "Resource": [
                `arn:aws:glue:${functionRegion}:${functionAccountId}:table/*`,
                `arn:aws:glue:${functionRegion}:${functionAccountId}:database/*`,
                `arn:aws:glue:${functionRegion}:${functionAccountId}:catalog`
            ]
        })
    } else {
        resourcePolicy.Statement.push(ramPolicyDocument)
    }

    await glue.putResourcePolicy({
        PolicyInJson: JSON.stringify(resourcePolicy),
        EnableHybrid: "TRUE"
    }).promise();

}