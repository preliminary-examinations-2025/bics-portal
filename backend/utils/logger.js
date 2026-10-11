const { SystemLogModel } = require('../models/SystemLog');
const { dbState, getJSONData, saveJSONData } = require('../config/db');

const logSystemAction = async (actor, action, details, severity = 'info') => {
    try {
        console.log(`LOG [${severity.toUpperCase()}]: actor=${actor}, action=${action}, details=${details}`);
        if (dbState.useMongo) {
            const newLog = new SystemLogModel({ actor, action, details, severity });
            await newLog.save();
        } else {
            const db = getJSONData();
            db.systemLogs = db.systemLogs || [];
            db.systemLogs.push({
                timestamp: new Date(),
                actor,
                action,
                details,
                severity
            });
            saveJSONData(db);
        }
    } catch (err) {
        console.error("Logger Error:", err.message);
    }
};

module.exports = {
    logSystemAction
};
