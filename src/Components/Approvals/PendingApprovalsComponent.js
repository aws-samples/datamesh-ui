import { Alert, Box, BreadcrumbGroup, Button, ButtonDropdown, ContentLayout, ExpandableSection, Header, SpaceBetween, Table, TokenGroup } from "@cloudscape-design/components"
import { useEffect, useState } from "react"
import Approvals from "../../Backend/Approvals"
import RouterAwareBreadcrumbComponent from "../RouterAwareBreadcrumbComponent"
import ValueWithLabel from "../ValueWithLabel"

function PendingApprovalsComponent(props) {
    const [pending, setPending] = useState([])
    const [forceReload, setForceReload] = useState(0)
    const [processing, setProcessing] = useState(false)
    const [error, setError] = useState(null)

    useEffect(() => {
        if (props.breadcrumbsCallback) {
            props.breadcrumbsCallback(
                <RouterAwareBreadcrumbComponent items={[
                    { text: "Data Domains", href: "/"},
                    { text: "Pending Approvals" }
                ]} />
            )
        }
        async function run() {
            const pending = await Approvals.getPendingApprovals()

            setPending(pending)
        }

        run()
    }, [forceReload])

    const renderTimestamp = (item) => {        
        const d = new Date(parseInt(item.requestIdentifier.S.split("#")[1]))
        return (
            <span>{d.toLocaleString()}</span>
        )
    }

    const renderTags = (item) => {
        if (item.lfTags) {
            const lfTags = JSON.parse(item.lfTags.S)

            return (
                <ExpandableSection header={<Header variant="h4">View Tags</Header>}>
                    <Table items={lfTags} columnDefinitions={[
                        {
                            header: "Tag Key",
                            cell: e => e.TagKey
                        },
                        {
                            header: "Tag Value",
                            cell: e => e.TagValues[0]
                        }
                    ]}></Table>
                </ExpandableSection>
            )
        }

        return (
            <span>n/a</span>
        )
    }

    const processApproval = async(detail) => {
        const eventId = detail.id
        setProcessing(true)
        const [actionType, sourceAccountId, requestIdentifier] = eventId.split("-")
        try {
            await Approvals.processApproval(sourceAccountId, requestIdentifier, actionType)
            setError(null)
            setForceReload(forceReload + 1)
        } catch (e) {
            setError("An unexpected error has occurred, please try again")
        }
        
        setProcessing(false)
    }

    return (
        <Box>
            <ContentLayout header={<Header variant="h1">Pending Approvals</Header>}>
                <Alert header="Processing Error" type="error" visible={error}>{error}</Alert>
                <Table empty={
                    <Box textAlign="center">
                        <b>No pending approval requests</b>
                    </Box>
                } items={pending} columnDefinitions={[
                    {
                        header: "Date/Time Requested",
                        cell: item => renderTimestamp(item)
                    },
                    {
                        header: "Mode",
                        cell: item => item.mode.S
                    },
                    {
                        header: "Source Domain",
                        cell: item => item.sourceDomain.S
                    },
                    {
                        header: "Target Domain",
                        cell: item => item.targetAccountId.S
                    },
                    {
                        header: "Actions",
                        cell: item => <ButtonDropdown onItemClick={({detail}) => processApproval(detail)} disabled={processing} expandToViewport="true" items={[
                            {text: "Approve", id: `approve-${item.accountId.S}-${item.requestIdentifier.S}`},
                            {text: "Reject", id: `reject-${item.accountId.S}-${item.requestIdentifier.S}`}
                        ]}>Actions</ButtonDropdown>
                    }
                ]} />
            </ContentLayout>
        </Box>
    )
}

export default PendingApprovalsComponent