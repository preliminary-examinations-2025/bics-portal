const { SystemLogModel } = require('../models/SystemLog');
const { dbState, getJSONData, saveJSONData } = require('../config/db');

/**
 * Log System & Change-Data-Capture (CDC) Audit Action
 * Supports legacy signature (actor, action, details, severity)
 * or enriched CDC object options { actor, actorId, actorRole, action, resourceType, resourceId, details, beforeState, afterState, diff, ipAddress, userAgent, severity }
 */
const logSystemAction = async (actorOrOptions, actionParam, detailsParam, severityParam = 'info') => {
    try {
        let logData = {};
        if (typeof actorOrOptions === 'object' && actorOrOptions !== null) {
            logData = {
                timestamp: new Date(),
                actor: actorOrOptions.actor || 'system',
                actorId: actorOrOptions.actorId || actorOrOptions.actor || 'system',
                actorRole: actorOrOptions.actorRole || 'unknown',
                action: actorOrOptions.action,
                resourceType: actorOrOptions.resourceType,
                resourceId: actorOrOptions.resourceId,
                details: actorOrOptions.details,
                beforeState: actorOrOptions.beforeState,
                afterState: actorOrOptions.afterState,
                diff: actorOrOptions.diff,
                ipAddress: actorOrOptions.ipAddress,
                userAgent: actorOrOptions.userAgent,
                severity: actorOrOptions.severity || 'info'
            };
        } else {
            logData = {
                timestamp: new Date(),
                actor: actorOrOptions || 'system',
                actorId: actorOrOptions || 'system',
                action: actionParam,
                details: detailsParam,
                severity: severityParam || 'info'
            };
        }

        console.log(`LOG [${logData.severity.toUpperCase()}]: actor=${logData.actor}, action=${logData.action}, details=${logData.details || ''}`);

        if (dbState.useMongo) {
            const newLog = new SystemLogModel(logData);
            await newLog.save();
        } else {
            const db = getJSONData();
            db.systemLogs = db.systemLogs || [];
            db.systemLogs.push(logData);
            saveJSONData(db);
        }
    } catch (err) {
        console.error("Logger Error:", err.message);
    }
};

module.exports = {
    logSystemAction
};
