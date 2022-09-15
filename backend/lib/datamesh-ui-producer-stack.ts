import { CfnParameter, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ProducerApprovalWorkflow } from "./producer/producer-approval-workflow";
import { ProducerStateChange } from "./producer/producer-state-change";

export class DataMeshUIProducerStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const centralEventBusArn = new CfnParameter(
            this,
            "centralEventBusArn",
            {
                type: "String",
                description:
                    "Central EventBridge ARN in Central Governance account",
            }
        );

        const centralAccountId = new CfnParameter(this, "centralAccountId", {
            type: "String",
            description: "Account ID of Central Governance account"
        });

        new ProducerApprovalWorkflow(this, "ProducerApprovalWorkflow", {
            centralAccountId: centralAccountId.valueAsString
        });

        new ProducerStateChange(this, "ProducerStateChange", {
            centralEventBusArn: centralEventBusArn.valueAsString
        })
    }
}