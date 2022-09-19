import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { Box, Button, ColumnLayout, Container, FormField, Grid, Header, Icon, Input, Link, Modal, SpaceBetween, StatusIndicator, Badge, ExpandableSection, Table } from "@cloudscape-design/components";
import {Amplify, Auth } from "aws-amplify";
import { useState } from "react";
import ValueWithLabel from "../ValueWithLabel";
const cfnOutput = require("../../cfn-output.json");
const tbacConfig = require("../../tbac-config.json");
const config = Amplify.configure();
const SM_ARN = cfnOutput.InfraStack.TbacStateMachineArn;
const EXTRACT_PRODUCER_ACCOUNT_ID = /^.+?(\d{12})$/

function DisplayLFTagsComponent(props) {
    const [modalVisible, setModalVisible] = useState(false);
    const [shareTagKey, setShareTagKey] = useState(null);
    const [shareTagValue, setShareTagValue] = useState(null)
    const [targetAccountId, setTargetAccountId] = useState(null)
    const [success, setSuccess] = useState(null)
    const [error, setError] = useState(null);   

    const showShareDialog = (key, value) => {
        setShareTagKey(key);
        setShareTagValue(value)
        setModalVisible(true);
    }

    const requestAccess = async() => {
        const dataDomain = props.lfTags.find((row) => row.TagKey == tbacConfig.TagKeys.LineOfBusiness)
        if (!targetAccountId) {
            setError("Target Account ID is required");
        } else {
            // console.log("Tag Key: "+shareTagKey)
            // console.log("Tag Value: "+shareTagValue)
            const producerAccountId = EXTRACT_PRODUCER_ACCOUNT_ID.exec(props.database)[1]
            const credentials = await Auth.currentCredentials();
            const sfnClient = new SFNClient({region: config.aws_project_region, credentials: Auth.essentialCredentials(credentials)});

            try {
                
                const params = {
                    producerAccountId,
                    targetAccountId,
                    "databaseName": props.database,
                    "lfTags": [
                        {
                            "TagKey": tbacConfig.TagKeys.LineOfBusiness,
                            "TagValues": [dataDomain.TagValues[0]]
                        },
                        {
                            "TagKey": shareTagKey,
                            "TagValues": [shareTagValue]
                        }
                    ]
                }
                
                await sfnClient.send(new StartExecutionCommand({
                    input: JSON.stringify(params),
                    stateMachineArn: SM_ARN
                }));


                setTargetAccountId(null);
                setError(null);
                setSuccess("Request for access sent successfully")
            } catch (e) {
                setError("An unexpected error occurred: "+e);
                setSuccess(null);
            }
        }
    }

    const cancelModal = () => {
        setShareTagKey(null);
        setShareTagValue(null);
        setTargetAccountId(null);
        setError(null);
        setSuccess(null);
        setModalVisible(false);
    }

    const renderTagRow = (tagRow, props) => {
        if (tagRow.TagKey == tbacConfig.TagKeys.LineOfBusiness && props.showDataDomain) {
            return (<ValueWithLabel label={tagRow.TagKey}><StatusIndicator type="info">{tagRow.TagValues[0]}</StatusIndicator></ValueWithLabel>);
        } else if (tagRow.TagKey != tbacConfig.TagKeys.LineOfBusiness) {
            return (
                <ValueWithLabel label={tagRow.TagKey}>
                    <Link onFollow={() => showShareDialog(tagRow.TagKey, tagRow.TagValues[0])}>
                        {tagRow.TagKey == tbacConfig.TagKeys.Confidentiality && tagRow.TagValues[0] == "sensitive" ? <StatusIndicator type="warning">{tagRow.TagValues[0]}</StatusIndicator> : tagRow.TagValues[0]}
                    </Link>
                </ValueWithLabel>
            );
        }

        return null;
    }

    const renderTagValue = (tagRow) => {
        if (tagRow.TagKey == tbacConfig.TagKeys.LineOfBusiness) {
            return (tagRow.TagValues[0])
        } else {
            return (
                <Link onFollow={() => showShareDialog(tagRow.TagKey, tagRow.TagValues[0])}>
                    {tagRow.TagValues[0]}
                </Link>
            )
        }
    }

    if (props.lfTags && props.lfTags.length > 0) {
        return (
            <Box>
                <ExpandableSection header={<Header variant="h4">View Associated Tags</Header>}>
                    {/* <ColumnLayout columns={2} variant="text-grid">
                        <SpaceBetween size="m">
                            {props.lfTags ? props.lfTags.map((tagRow) => {
                                return (renderTagRow(tagRow, props))
                            }): "n/a"}
                        </SpaceBetween>
                    </ColumnLayout>                     */}
                    <Table items={props.lfTags} columnDefinitions={[
                        {
                            header: "Tag Key",
                            cell: e => e.TagKey
                        },
                        {
                            header: "Tag Value",
                            cell: e => renderTagValue(e)
                        }
                    ]}></Table>
                </ExpandableSection>

                <Modal onDismiss={() => setModalVisible(false)} visible={modalVisible} header="Request Tag Access" footer={
                    <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="link" onClick={cancelModal}>Cancel</Button>
                        <Button variant="primary" onClick={requestAccess}>Request Access</Button>
                    </SpaceBetween>}>
                    <Box margin={{bottom: "l"}}>
                        You're requesting access to <strong>{shareTagKey}</strong> = <strong>{shareTagValue}</strong>
                    </Box>
                    <FormField label="Target Account ID" errorText={error}>
                        <Input type="number" value={targetAccountId} onChange={event => setTargetAccountId(event.detail.value)} />
                    </FormField>
                    {success ? <StatusIndicator>{success}</StatusIndicator> : null}
                </Modal>
            </Box>
        )
    } else {
        return (
            <Badge color="grey">
                No Associated Tags
            </Badge>
        )
    }
}

export default DisplayLFTagsComponent;