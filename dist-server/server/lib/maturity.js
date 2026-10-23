/**
 * 可采摘的成熟度等级集合：接近成熟、成熟、过熟。
 */
export const HARVESTABLE_LEVELS = new Set([
    '接近成熟',
    '成熟',
    '过熟',
]);
/**
 * 判断给定成熟度等级是否可采摘。
 * null 表示无评估记录，返回 false。
 */
export function isHarvestable(level) {
    if (level === null)
        return false;
    return HARVESTABLE_LEVELS.has(level);
}
/**
 * 查询指定地块最新评估记录的成熟度等级。
 * 无评估记录时返回 null。
 */
export function getLatestMaturityLevel(db, plotId) {
    const row = db
        .prepare(`SELECT maturity_level
         FROM maturity_assessments
        WHERE plot_id = ?
        ORDER BY assessment_time DESC, created_at DESC
        LIMIT 1`)
        .get(plotId);
    return row ? row.maturity_level : null;
}
/**
 * 判断指定地块是否可采摘（基于最新评估记录）。
 */
export function isPlotHarvestable(db, plotId) {
    return isHarvestable(getLatestMaturityLevel(db, plotId));
}
