"use strict";
// ============================================================
// src/app.ts — Express application setup
// ============================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const auth_1 = __importDefault(require("./routes/auth"));
const users_1 = __importDefault(require("./routes/users"));
const products_1 = __importDefault(require("./routes/products"));
const poms_1 = __importDefault(require("./routes/poms"));
const surveys_1 = __importDefault(require("./routes/surveys"));
const brands_1 = __importDefault(require("./routes/brands"));
const categories_1 = __importDefault(require("./routes/categories"));
const solutions_1 = __importDefault(require("./routes/solutions"));
const formTemplates_1 = __importDefault(require("./routes/formTemplates"));
const errorHandler_1 = require("./middleware/errorHandler");
function createApp() {
    const app = (0, express_1.default)();
    // ============================================================
    // MIDDLEWARE
    // ============================================================
    app.use((0, helmet_1.default)());
    app.use((0, cors_1.default)({
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        credentials: true
    }));
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: true }));
    // ============================================================
    // HEALTH CHECK
    // ============================================================
    app.get('/health', (req, res) => {
        res.json({
            status: 'ok',
            timestamp: new Date().toISOString()
        });
    });
    // ============================================================
    // API ROUTES
    // ============================================================
    app.use('/api/auth', auth_1.default);
    app.use('/api/users', users_1.default);
    app.use('/api/products', products_1.default);
    app.use('/api/poms', poms_1.default);
    app.use('/api/surveys', surveys_1.default);
    app.use('/api/brands', brands_1.default);
    app.use('/api/categories', categories_1.default);
    app.use('/api/solutions', solutions_1.default);
    app.use('/api/form-templates', formTemplates_1.default);
    // ============================================================
    // ERROR HANDLING
    // ============================================================
    app.use(errorHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
}
//# sourceMappingURL=app.js.map
