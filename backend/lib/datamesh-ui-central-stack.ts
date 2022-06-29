import { Aws, CfnParameter, Stack } from "aws-cdk-lib";
import { Construct } from "constructs";
import { ApprovalWorkflow } from "./central/approval-workflow";
import { DataQualityCentralAccount } from "./central/data-quality-central-account";
import { DataMeshUI } from "./central/datamesh-ui";
import { DataMeshUIAuth } from "./central/datamesh-ui-auth";
import { GlueCatalogSearchApi } from "./central/glue-catalog-search-api";

export class DataMeshUICentralStack extends Stack {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const centralStateMachineArn = new CfnParameter(
            this,
            "centralStateMachineArn",
            {
                type: "String",
                description: "State Machine ARN in Central Governance account",
            }
        );

        const centralLfAdminRoleArn = new CfnParameter(
            this,
            "centralLfAdminRoleArn",
            {
                type: "String",
                description:
                    "LakeFormation Admin Role ARN in Central Governance account",
            }
        );

        const centralEventBusArn = new CfnParameter(
            this,
            "centralEventBusArn",
            {
                type: "String",
                description:
                    "Central EventBridge ARN in Central Governance account",
            }
        );

        const centralOpensearchSize = new CfnParameter(
            this,
            "centralOpensearchSize",
            {
                type: "String",
                description: "Instance size of OpenSearch node",
                default: "t3.small.search",
            }
        );

        const centralOpensearchVpcCidrRange = new CfnParameter(
            this,
            "centralOpensearchVpcCidrRange",
            {
                type: "String",
                description:
                    "VPC CIDR range for the VPC of the OpenSearch cluster",
                default: "10.37.0.0/16",
            }
        );

        const approvalWorkflow = new ApprovalWorkflow(
            this,
            "ApprovalWorkflow",
            {
                centralEventBusArn: centralEventBusArn.valueAsString,
                dpmStateMachineArn: centralStateMachineArn.valueAsString,
                dpmStateMachineRoleArn: centralLfAdminRoleArn.valueAsString,
            }
        );

        const dataMeshUIAuth = new DataMeshUIAuth(this, "DataMeshUIAuth");

        const dataQuality = new DataQualityCentralAccount(
            this,
            "DataQualityCentralAccount",
            {
                userPool: dataMeshUIAuth.userPool,
            }
        );

        const searchCatalog = new GlueCatalogSearchApi(
            this,
            "SearchCatalogAPI",
            {
                accountId: Aws.ACCOUNT_ID,
                opensearchDataNodeInstanceSize:
                    centralOpensearchSize.valueAsString,
                userPool: dataMeshUIAuth.userPool,
                vpcCidrRange: centralOpensearchVpcCidrRange.valueAsString,
            }
        );

        new DataMeshUI(this, "DataMeshUI", {
            stateMachineArn: approvalWorkflow.stateMachine.stateMachineArn,
            stateMachineName: approvalWorkflow.stateMachine.stateMachineName,
            dpmStateMachineArn: centralStateMachineArn.valueAsString,
            dpmStateMachineRoleArn: centralLfAdminRoleArn.valueAsString,
            dataQualityHttpApiUrl: dataQuality.dataQualityEndpoint,
            searchApiUrl: searchCatalog.osEndpoint,
            userPool: dataMeshUIAuth.userPool,
            identityPool: dataMeshUIAuth.identityPool,
        });
    }
}
