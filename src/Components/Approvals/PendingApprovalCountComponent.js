import { Alert, Box, Link } from "@cloudscape-design/components"
import { useEffect, useState } from "react"
import Approvals from "../../Backend/Approvals"

function PendingApprovalCountComponent(props) {
    const [pendingCount, setPendingCount] = useState(0)

    useEffect(() => {
        async function run() {
            setPendingCount(await Approvals.getPendingApprovalCount())
        }

        run()
    }, [])

    if (pendingCount > 0) {
        return (
            <Box margin={{top: "m"}}>
                <Alert header="Pending Approvals" type="info">
                    There are <Link href="/approvals/pending">{pendingCount} pending approvals</Link>.
                </Alert>
            </Box>
        )
    }

    return null
}

export default PendingApprovalCountComponent