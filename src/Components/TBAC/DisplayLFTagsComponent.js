import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { Box, Button, ColumnLayout, Container, FormField, Grid, Header, Icon, Input, Link, Modal, SpaceBetween, StatusIndicator, Badge, ExpandableSection, Table, Select, Spinner } from "@cloudscape-design/components";
import {Amplify, Auth } from "aws-amplify";
import { useEffect, useState } from "react";
import DataDomain from "../../Backend/DataDomain"
import AuthWorkflow from "../../Backend/AuthWorkflow"
const cfnOutput = require("../../cfn-output.json");
const tbacConfig = require("../../tbac-config.json");
const config = Amplify.configure();
const SM_ARN = cfnOutput.InfraStack.TbacStateMachineArn;
const EXTRACT_PRODUCER_ACCOUNT_ID = /^.+?(\d{12})$/
const Buffer = require("buffer/").Buffer

function DisplayLFTagsComponent(props) {
    const [modalVisible, setModalVisible] = useState(false);
    const [shareTagKey, setShareTagKey] = useState(null);
    const [shareTagValue, setShareTagValue] = useState(null)
    const [targetAccountId, setTargetAccountId] = useState(null)
    const [success, setSuccess] = useState(null)
    const [owner, setOwner] = useState(false)
    const [error, setError] = useState(null);   
    const [producerAccountId, setProducerAccountId] = useState()
    const [domainIdOptions, setDomainIdOptions] = useState([])
    const [dataDomain, setDataDomain] = useState(null)
    const [spinner, setSpinner] = useState(false)

    const renderSubmitRequestAccess = () => {
        if (spinner) {
            return (
                <Button variant="primary" disabled="true"><Spinner /> Request Access</Button>
            )
        } else {
            return (
                <Button variant="primary" onClick={requestAccess}>Request Access</Button>
            )
        }
    }

    const generateLfTagArrayPayload = (key, value) => {
        return  [
            {
                "TagKey": tbacConfig.TagKeys.LineOfBusiness,
                "TagValues": [dataDomain.TagValues[0]]
            },
            {
                "TagKey": key,
                "TagValues": [value]
            }
        ]
    }

    const showShareDialog = async(key, value) => {
        setShareTagKey(key);
        setShareTagValue(value)

        await refreshSelection(key, value)
        setModalVisible(true);
    }

    const refreshSelection = async(key, value) => {
        const payload = `tags-${(Buffer.from(JSON.stringify(generateLfTagArrayPayload(key, value)))).toString("base64")}`
        
        const {sharedAccountIds} = await DataDomain.getListOfShared(props.database, payload)
        
        let selectFormatted = []

        if (sharedAccountIds && sharedAccountIds.length > 0) {
            selectFormatted = sharedAccountIds.map((row) => {
                return {
                    label: row.accountId,
                    value: row.accountId,
                    description: row.status,
                    disabled: row.status && row.status != "rejected"
                }
            })
        }

        setDomainIdOptions(selectFormatted)
    }

    const requestAccess = async() => {
        if (!targetAccountId) {
            setError("Target Account ID is required");
        } else {
            setSpinner(true)
            try {
                
                const params = JSON.stringify({
                    producerAccountId,
                    "targetAccountId": targetAccountId.value,
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
                })

                await AuthWorkflow.exec(SM_ARN, params, targetAccountId.value)

                await refreshSelection(shareTagKey, shareTagValue)
                setTargetAccountId(null);
                setError(null);
                setSuccess("Request for access sent successfully")
                setSpinner(false)
            } catch (e) {
                setError("An unexpected error occurred: "+e);
                setSuccess(null);
            }
        }
    }

    const cancelModal = () => {
        setShareTagKey(null);
        setShareTagValue(null);
        // setTargetAccountId(null);
        setError(null);
        setSuccess(null);
        setModalVisible(false);
    }

    const renderTagValue = (tagRow) => {
        if (tagRow.TagKey == tbacConfig.TagKeys.LineOfBusiness || owner) {
            return (tagRow.TagValues[0])
        } else {
            return (
                <Link onFollow={() => showShareDialog(tagRow.TagKey, tagRow.TagValues[0])}>
                    {tagRow.TagValues[0]}
                </Link>
            )
        }
    }

    useEffect(() => {
        async function run() {
            if (props.lfTags && props.lfTags.length > 0) {
                const prodAccountId = EXTRACT_PRODUCER_ACCOUNT_ID.exec(props.database)[1]
                setProducerAccountId(prodAccountId)
                setOwner(await DataDomain.isOwner(prodAccountId))
                setDataDomain(props.lfTags ? props.lfTags.find((row) => row.TagKey == tbacConfig.TagKeys.LineOfBusiness) : null)
            }
        }

        run()
    }, [props.lfTags])

    if (props.lfTags && props.lfTags.length > 0) {
        return (
            <Box>
                <ExpandableSection header={<Header variant="h4">View Associated Tags</Header>}>
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

                <Modal onDismiss={() => cancelModal()} visible={modalVisible} header={<Header variant="h3">Requesting Tag Access from {dataDomain ? dataDomain.TagValues[0] : null}</Header>} footer={
                    <SpaceBetween direction="horizontal" size="xs">
                        <Button variant="link" onClick={cancelModal}>Cancel</Button>
                        {renderSubmitRequestAccess()}
                    </SpaceBetween>}>
                    <Box margin={{bottom: "l"}}>
                        You're requesting access to <strong>{shareTagKey}</strong> = <strong>{shareTagValue}</strong>.
                    </Box>
                    <FormField label="Target Account ID" errorText={error}>
                        <Select selectedOption={targetAccountId} options={domainIdOptions} onChange={({detail}) => setTargetAccountId(detail.selectedOption)} />
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