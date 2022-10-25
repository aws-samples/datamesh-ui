import { Box, Header, Table } from "@cloudscape-design/components"
import { useEffect, useState } from "react"
import DataDomain from "../Backend/DataDomain"

function ProductConsumersComponent({dbName, tableName}) {
    const [consumers, setConsumers] = useState([])

    useEffect(() => {
        async function run() {
            const {consumerAccountIds} = await DataDomain.getListOfConsumers(dbName, tableName)
            setConsumers(consumerAccountIds)
        }

        run()
    }, [dbName, tableName])

    return (
        <Table header={<Header variant="h3">Consumers</Header>} items={consumers} columnDefinitions={[
            {
                header: "Consumer Domain Id",
                cell: row => row.accountId
            }
        ]} empty={
            <Box textAlign="center">
                <b>No consumers for this product</b>
            </Box>
        }></Table>
    )
}

export default ProductConsumersComponent