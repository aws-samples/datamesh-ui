import { CfnParameter } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ProducerApprovalWorkflow } from "./producer/producer-approval-workflow";

export class DataMeshUIProducerStack extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const centralAccountId = new CfnParameter(this, "centralAccountId", {
            type: "String",
            description: "Account ID of Central Governance account"
        });

        new ProducerApprovalWorkflow(this, "ProducerApprovalWorkflow", {
            centralAccountId: centralAccountId.valueAsString
        });
    }
}