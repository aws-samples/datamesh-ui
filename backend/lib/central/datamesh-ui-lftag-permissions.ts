import { HttpApi, HttpMethod } from "@aws-cdk/aws-apigatewayv2-alpha";
import { HttpLambdaIntegration } from "@aws-cdk/aws-apigatewayv2-integrations-alpha";
import { HttpUserPoolAuthorizer } from "@aws-cdk/aws-apigatewayv2-authorizers-alpha";
import { CustomResource } from "aws-cdk-lib";
import { Effect, IRole, ManagedPolicy, PolicyDocument, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { CfnDataLakeSettings } from "aws-cdk-lib/aws-lakeformation";
import { Code, Function, Runtime } from "aws-cdk-lib/aws-lambda";
import { Provider } from "aws-cdk-lib/custom-resources";
import { Construct } from "constructs";

export interface DataMeshUILFTagPermissionsProps {
    rolesToGrant: string[]
    httpApi: HttpApi
}

export default class DataMeshUILFTagPermissions extends Construct {
    readonly crDataMeshUITagAccessRole: IRole

    constructor(scope: Construct, id: string, props: DataMeshUILFTagPermissionsProps) {
        super(scope, id);

        const crDataMeshUITagAccessRole = new Role(this, "CRDataMeshUITagAccessRole", {
            assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")],
            inlinePolicies: {inline0: new PolicyDocument({
                statements: [
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "lakeformation:ListLFTags",
                            "lakeformation:GrantPermissions",
                            "lakeformation:BatchGrantPermissions",
                            "lakeformation:RevokePermissions",
                            "lakeformation:BatchRevokePermissions"
                        ],
                        resources: ["*"]
                    })
                ]
            })}
        });

        // new CfnDataLakeSettings(this, "LakeFormationSettings", {
        //     admins: [
        //         {
        //             dataLakePrincipalIdentifier: crDataMeshUITagAccessRole.roleArn
        //         }
        //     ]
        // });

        this.crDataMeshUITagAccessRole = crDataMeshUITagAccessRole

        const crDataMeshUITagAccessFunction = new Function(this, "CRDataMeshUITagAccessFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: crDataMeshUITagAccessRole,
            handler: "index.handler",
            code: Code.fromAsset(__dirname+"/resources/lambda/CRDataMeshUITagAccess"),
            environment: {
                ROLES_TO_GRANT: JSON.stringify(props.rolesToGrant)
            }
        })

        const crLFTagsProvider = new Provider(this, "CRLFTagsProvider", {
            onEventHandler: crDataMeshUITagAccessFunction
        })

        new CustomResource(this, "CRLFTagsAssociationResource", {serviceToken: crLFTagsProvider.serviceToken})

        const syncDataMeshUITagAccessFunction = new Function(this, "SyncDataMeshUITagAccessFunction", {
            runtime: Runtime.NODEJS_LATEST,
            role: crDataMeshUITagAccessRole,
            handler: "index.handler",
            code: Code.fromAsset(__dirname+"/resources/lambda/SyncDataMeshUITagAccess"),
            environment: {
                ROLES_TO_GRANT: JSON.stringify(props.rolesToGrant)
            }
        })

        props.httpApi.addRoutes({
            path: "/tags/sync-permissions",
            methods: [HttpMethod.POST],
            integration: new HttpLambdaIntegration("SyncDataMeshUITagAccessIntegration", syncDataMeshUITagAccessFunction)
        })
    }
}