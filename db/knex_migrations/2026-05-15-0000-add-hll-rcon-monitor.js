/**
 * Adds the columns required by the "hll-rcon" monitor type.
 *
 * - hll_rcon_password         : RCONv2 password (sensitive)
 * - hll_min_players_enabled   : enable low-population alert
 * - hll_min_players           : threshold; DOWN when current player count is below this
 * - hll_exit_enabled          : enable rapid-exit alert
 * - hll_exit_drop             : DOWN when cumulative player count drop within window >= this
 * - hll_exit_window_sec       : sliding time window in seconds for the drop check
 * @param {import("knex").Knex} knex The Knex.js instance for database interaction.
 * @returns {Promise<void>}
 */
exports.up = async (knex) => {
    await knex.schema.alterTable("monitor", (table) => {
        table.string("hll_rcon_password");
        table.boolean("hll_min_players_enabled").notNullable().defaultTo(false);
        table.integer("hll_min_players").notNullable().defaultTo(0);
        table.boolean("hll_exit_enabled").notNullable().defaultTo(false);
        table.integer("hll_exit_drop").notNullable().defaultTo(0);
        table.integer("hll_exit_window_sec").notNullable().defaultTo(300);
    });
};

/**
 * @param {import("knex").Knex} knex The Knex.js instance for database interaction.
 * @returns {Promise<void>}
 */
exports.down = async (knex) => {
    await knex.schema.alterTable("monitor", (table) => {
        table.dropColumn("hll_rcon_password");
        table.dropColumn("hll_min_players_enabled");
        table.dropColumn("hll_min_players");
        table.dropColumn("hll_exit_enabled");
        table.dropColumn("hll_exit_drop");
        table.dropColumn("hll_exit_window_sec");
    });
};
