exports.handler = async (event) => {
    const centralDbName = event.source.database;
    const rawDb = centralDbName.substring(centralDbName.indexOf("_") + 1);
    return {
        "raw_db": rawDb
    }
};
