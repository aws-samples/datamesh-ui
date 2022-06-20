exports.handler = async (event) => {
    const centralDbName = event.source.database;
    const exploded = centralDbName.split("_");
    const producerAccountId = exploded[0];
    const rawDb = exploded[1];
    return {
        "producer_acc_id": producerAccountId,
        "raw_db": rawDb
    }
};
