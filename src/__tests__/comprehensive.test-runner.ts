#!/usr/bin/env ts-node

/**
 * Comprehensive Test Runner for Complete Testing Suite
 * 
 * This runner executes all test categories in the correct order:
 * 1. Unit Tests (fast, isolated)
 * 2. Integration Tests (medium speed, with database)
 * 3. End-to-End Tests (complete workflows)
 * 4. Performance Tests (large datasets, load testing)
 * 5. Security Tests (authentication, authorization, injection prevention)
 * 6. WebSocket Tests (real-time communication)
 */

import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import path from 'path';

interface TestSuite {
    name: string;
    pattern: string;
    timeout: number;
    description: string;
    category: 'unit' | 'integration' | 'e2e' | 'performance' | 'security' | 'websocket';
    priority: number;
}

const testSuites: TestSuite[] = [
    // Unit Tests - Highest Priority
    {
        name: 'Database Service Unit Tests',
        pattern: '**/database*.unit.test.ts',
        timeout: 30000,
        description: 'Database service unit tests',
        category: 'unit',
        priority: 1
    },
    {
        name: 'Auth Service Unit Tests',
        pattern: '**/authService*.unit.test.ts',
        timeout: 30000,
        description: 'Authentication service unit tests',
        category: 'unit',
        priority: 1
    },
    {
        name: 'Attendance Service Unit Tests',
        pattern: '**/attendanceService*.unit.test.ts',
        timeout: 30000,
        description: 'Attendance service unit tests',
        category: 'unit',
        priority: 1
    },
    {
        name: 'Student Service Unit Tests',
        pattern: '**/studentService*.unit.test.ts',
        timeout: 30000,
        description: 'Student service unit tests',
        category: 'unit',
        priority: 1
    },
    {
        name: 'Utility Unit Tests',
        pattern: '**/utils/**/*.unit.test.ts',
        timeout: 30000,
        description: 'Utility function unit tests',
        category: 'unit',
        priority: 1
    },

    // Integration Tests - Medium Priority
    {
        name: 'API Integration Tests',
        pattern: '**/api*.integration.test.ts',
        timeout: 60000,
        description: 'API endpoint integration tests',
        category: 'integration',
        priority: 2
    },
    {
        name: 'Database Integration Tests',
        pattern: '**/database*.integration.test.ts',
        timeout: 60000,
        description: 'Database integration tests',
        category: 'integration',
        priority: 2
    },
    {
        name: 'Sync Integration Tests',
        pattern: '**/sync*.integration.test.ts',
        timeout: 90000,
        description: 'Sync service integration tests',
        category: 'integration',
        priority: 2
    },

    // End-to-End Tests
    {
        name: 'Complete Workflow E2E Tests',
        pattern: '**/e2e*.test.ts',
        timeout: 120000,
        description: 'End-to-end workflow tests',
        category: 'e2e',
        priority: 3
    },
    {
        name: 'Authentication Flow E2E Tests',
        pattern: '**/auth*.e2e.test.ts',
        timeout: 90000,
        description: 'Complete authentication flow tests',
        category: 'e2e',
        priority: 3
    },

    // WebSocket Tests
    {
        name: 'WebSocket Communication Tests',
        pattern: '**/websocket*.test.ts',
        timeout: 60000,
        description: 'WebSocket communication tests',
        category: 'websocket',
        priority: 4
    },
    {
        name: 'ML Integration WebSocket Tests',
        pattern: '**/ml*.websocket.test.ts',
        timeout: 90000,
        description: 'ML model WebSocket integration tests',
        category: 'websocket',
        priority: 4
    },

    // Performance Tests - Lower Priority (Slower)
    {
        name: 'Database Performance Tests',
        pattern: '**/database*.performance.test.ts',
        timeout: 180000,
        description: 'Database performance and load tests',
        category: 'performance',
        priority: 5
    },
    {
        name: 'Sync Performance Tests',
        pattern: '**/sync*.performance.test.ts',
        timeout: 300000,
        description: 'Large dataset sync performance tests',
        category: 'performance',
        priority: 5
    },
    {
        name: 'API Performance Tests',
        pattern: '**/api*.performance.test.ts',
        timeout: 240000,
        description: 'API endpoint performance tests',
        category: 'performance',
        priority: 5
    },

    // Security Tests - Critical but can be slow
    {
        name: 'Authentication Security Tests',
        pattern: '**/auth*.security.test.ts',
        timeout: 90000,
        description: 'Authentication security tests',
        category: 'security',
        priority: 6
    },
    {
        name: 'SQL Injection Prevention Tests',
        pattern: '**/sql*.security.test.ts',
        timeout: 60000,
        description: 'SQL injection prevention tests',
        category: 'security',
        priority: 6
    },
    {
        name: 'Comprehensive Security Tests',
        pattern: '**/security*.test.ts',
        timeout: 120000,
        description: 'Comprehensive security tests',
        category: 'security',
        priority: 6
    }
];

interface TestResult {
    suite: string;
    category: string;
    passed: boolean;
    duration: number;
    coverage?: number;
    errors?: string[];
}

interface TestRunOptions {
    verbose: boolean;
    failFast: boolean;
    coverage: boolean;
    parallel: boolean;
    categories: string[];
    outputFormat: 'console' | 'json' | 'html';
    reportFile?: string;
}

class ComprehensiveTestRunner {
    private options: TestRunOptions;
    private results: TestResult[] = [];
    private startTime: number = 0;

    constructor(options: Partial<TestRunOptions> = {}) {
        this.options = {
            verbose: options.verbose || false,
            failFast: options.failFast || false,
            coverage: options.coverage || false,
            parallel: options.parallel || false,
            categories: options.categories || ['unit', 'integration', 'e2e', 'websocket', 'performance', 'security'],
            outputFormat: options.outputFormat || 'console',
            reportFile: options.reportFile
        };
    }

    async runAllTests(): Promise<void> {
        this.startTime = Date.now();

        console.log('🚀 Starting Comprehensive Test Suite');
        console.log('=====================================');

        await this.checkTestEnvironment();

        // Filter test suites by selected categories
        const filteredSuites = testSuites
            .filter(suite => this.options.categories.includes(suite.category))
            .sort((a, b) => a.priority - b.priority);

        console.log(`\n📋 Running ${filteredSuites.length} test suites across ${this.options.categories.length} categories\n`);

        if (this.options.parallel && this.canRunInParallel()) {
            await this.runTestsInParallel(filteredSuites);
        } else {
            await this.runTestsSequentially(filteredSuites);
        }

        await this.generateReport();
        this.printFinalSummary();
    }

    private async runTestsSequentially(suites: TestSuite[]): Promise<void> {
        for (const suite of suites) {
            const startTime = Date.now();

            try {
                console.log(`📋 Running ${suite.name}...`);
                console.log(`   Category: ${suite.category.toUpperCase()}`);
                console.log(`   ${suite.description}`);

                await this.runTestSuite(suite);

                const duration = Date.now() - startTime;
                this.results.push({
                    suite: suite.name,
                    category: suite.category,
                    passed: true,
                    duration
                });

                console.log(`✅ ${suite.name} passed (${duration}ms)\n`);

            } catch (error) {
                const duration = Date.now() - startTime;
                this.results.push({
                    suite: suite.name,
                    category: suite.category,
                    passed: false,
                    duration,
                    errors: [error instanceof Error ? error.message : String(error)]
                });

                console.error(`❌ ${suite.name} failed (${duration}ms)`);

                if (this.options.verbose) {
                    console.error(error);
                }

                if (this.options.failFast) {
                    console.error('\n💥 Stopping due to test failure (fail-fast mode)');
                    process.exit(1);
                }
                console.log('');
            }
        }
    }

    private async runTestsInParallel(suites: TestSuite[]): Promise<void> {
        // Group suites by category for parallel execution within categories
        const suitesByCategory = suites.reduce((acc, suite) => {
            if (!acc[suite.category]) {
                acc[suite.category] = [];
            }
            acc[suite.category].push(suite);
            return acc;
        }, {} as Record<string, TestSuite[]>);

        // Run categories sequentially, but suites within categories in parallel
        for (const [category, categorySuites] of Object.entries(suitesByCategory)) {
            console.log(`\n🔄 Running ${category.toUpperCase()} tests in parallel...`);

            const promises = categorySuites.map(async (suite) => {
                const startTime = Date.now();
                try {
                    await this.runTestSuite(suite);
                    const duration = Date.now() - startTime;
                    return {
                        suite: suite.name,
                        category: suite.category,
                        passed: true,
                        duration
                    };
                } catch (error) {
                    const duration = Date.now() - startTime;
                    return {
                        suite: suite.name,
                        category: suite.category,
                        passed: false,
                        duration,
                        errors: [error instanceof Error ? error.message : String(error)]
                    };
                }
            });

            const categoryResults = await Promise.all(promises);
            this.results.push(...categoryResults);

            // Print category summary
            const passed = categoryResults.filter(r => r.passed).length;
            const failed = categoryResults.filter(r => !r.passed).length;
            console.log(`   ${category.toUpperCase()}: ${passed} passed, ${failed} failed`);

            if (failed > 0 && this.options.failFast) {
                console.error('\n💥 Stopping due to test failures (fail-fast mode)');
                process.exit(1);
            }
        }
    }

    private async runTestSuite(suite: TestSuite): Promise<void> {
        const jestCommand = this.buildJestCommand(suite);

        if (this.options.verbose) {
            console.log(`   Command: ${jestCommand}`);
        }

        try {
            execSync(jestCommand, {
                stdio: this.options.verbose ? 'inherit' : 'pipe',
                timeout: suite.timeout,
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    NODE_ENV: 'test'
                }
            });
        } catch (error: any) {
            if (error.status !== 0) {
                throw new Error(`Test suite failed with exit code ${error.status}`);
            }
            throw error;
        }
    }

    private buildJestCommand(suite: TestSuite): string {
        const baseCommand = 'npx jest';
        const options = [
            `--testPathPattern="${suite.pattern}"`,
            `--testTimeout=${suite.timeout}`,
            '--verbose',
            '--detectOpenHandles',
            '--forceExit'
        ];

        if (this.options.coverage) {
            options.push('--coverage');
            options.push('--coverageDirectory=coverage');
            options.push('--coverageReporters=text');
            options.push('--coverageReporters=lcov');
            options.push('--coverageReporters=html');
        }

        if (!this.options.verbose) {
            options.push('--silent');
        }

        return `${baseCommand} ${options.join(' ')}`;
    }

    private canRunInParallel(): boolean {
        // Check if system has enough resources for parallel execution
        const availableMemory = process.memoryUsage().heapTotal;
        const minMemoryForParallel = 2 * 1024 * 1024 * 1024; // 2GB

        return availableMemory > minMemoryForParallel;
    }

    private async checkTestEnvironment(): Promise<void> {
        console.log('🔍 Checking test environment...');

        // Check Node.js version
        const nodeVersion = process.version;
        console.log(`   Node.js: ${nodeVersion}`);

        // Check if database is available
        const dbConfigPath = path.join(process.cwd(), 'src', 'config', 'environment.ts');
        if (!existsSync(dbConfigPath)) {
            console.warn('⚠️  Database configuration not found');
        }

        // Set test environment
        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = 'test';
        }

        // Check available memory
        const memoryUsage = process.memoryUsage();
        console.log(`   Memory: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB used / ${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB total`);

        console.log(`   Environment: ${process.env.NODE_ENV}`);
        console.log(`   Database: ${process.env.DB_NAME || 'default'}`);
        console.log('✅ Environment check complete\n');
    }

    private async generateReport(): Promise<void> {
        if (this.options.outputFormat === 'json' || this.options.reportFile) {
            const report = {
                summary: this.generateSummary(),
                results: this.results,
                environment: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    timestamp: new Date().toISOString()
                }
            };

            const reportJson = JSON.stringify(report, null, 2);

            if (this.options.reportFile) {
                writeFileSync(this.options.reportFile, reportJson);
                console.log(`📄 Test report saved to: ${this.options.reportFile}`);
            }

            if (this.options.outputFormat === 'json') {
                console.log(reportJson);
            }
        }

        if (this.options.coverage) {
            console.log('\n📈 Coverage report generated in ./coverage/');
            console.log('   HTML report: ./coverage/lcov-report/index.html');
        }
    }

    private generateSummary() {
        const totalDuration = Date.now() - this.startTime;
        const passed = this.results.filter(r => r.passed).length;
        const failed = this.results.filter(r => !r.passed).length;

        const categoryStats = this.options.categories.map(category => {
            const categoryResults = this.results.filter(r => r.category === category);
            return {
                category,
                total: categoryResults.length,
                passed: categoryResults.filter(r => r.passed).length,
                failed: categoryResults.filter(r => !r.passed).length,
                duration: categoryResults.reduce((sum, r) => sum + r.duration, 0)
            };
        });

        return {
            total: this.results.length,
            passed,
            failed,
            duration: totalDuration,
            categories: categoryStats
        };
    }

    private printFinalSummary(): void {
        const summary = this.generateSummary();

        console.log('\n📊 Comprehensive Test Summary');
        console.log('==============================');

        // Overall stats
        console.log(`Total Suites: ${summary.total}`);
        console.log(`Passed: ${summary.passed}`);
        console.log(`Failed: ${summary.failed}`);
        console.log(`Duration: ${summary.duration}ms (${(summary.duration / 1000 / 60).toFixed(2)} minutes)`);

        // Category breakdown
        console.log('\nCategory Breakdown:');
        summary.categories.forEach(cat => {
            const status = cat.failed === 0 ? '✅' : '❌';
            const duration = `${(cat.duration / 1000).toFixed(2)}s`;
            console.log(`${status} ${cat.category.toUpperCase().padEnd(12)} ${cat.passed}/${cat.total} passed (${duration})`);
        });

        // Failed tests details
        const failedTests = this.results.filter(r => !r.passed);
        if (failedTests.length > 0) {
            console.log('\nFailed Tests:');
            failedTests.forEach(test => {
                console.log(`❌ ${test.suite} (${test.category})`);
                if (test.errors) {
                    test.errors.forEach(error => {
                        console.log(`   Error: ${error}`);
                    });
                }
            });
        }

        console.log('==============================');

        if (summary.failed > 0) {
            console.log('\n❌ Some tests failed!');
            process.exit(1);
        } else {
            console.log('\n🎉 All tests passed!');
        }
    }

    async runSpecificCategory(category: string): Promise<void> {
        if (!this.options.categories.includes(category)) {
            console.error(`❌ Category "${category}" not found`);
            console.log('Available categories:');
            ['unit', 'integration', 'e2e', 'websocket', 'performance', 'security'].forEach(cat => {
                console.log(`  - ${cat}`);
            });
            process.exit(1);
        }

        this.options.categories = [category];
        await this.runAllTests();
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const options: Partial<TestRunOptions> = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        failFast: args.includes('--fail-fast') || args.includes('-f'),
        coverage: args.includes('--coverage') || args.includes('-c'),
        parallel: args.includes('--parallel') || args.includes('-p'),
        outputFormat: args.includes('--json') ? 'json' : 'console'
    };

    // Check for report file option
    const reportIndex = args.findIndex(arg => arg.startsWith('--report='));
    if (reportIndex !== -1) {
        options.reportFile = args[reportIndex].split('=')[1];
    }

    // Check for specific categories
    const categoryIndex = args.findIndex(arg => arg.startsWith('--categories='));
    if (categoryIndex !== -1) {
        options.categories = args[categoryIndex].split('=')[1].split(',');
    }

    const runner = new ComprehensiveTestRunner(options);

    // Check for specific category
    const categoryArg = args.find(arg =>
        !arg.startsWith('--') &&
        !arg.startsWith('-') &&
        ['unit', 'integration', 'e2e', 'websocket', 'performance', 'security'].includes(arg)
    );

    try {
        if (categoryArg) {
            await runner.runSpecificCategory(categoryArg);
        } else {
            await runner.runAllTests();
        }
    } catch (error) {
        console.error('💥 Test runner failed:', error);
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error);
}

export { ComprehensiveTestRunner };