#!/usr/bin/env ts-node

/**
 * Comprehensive Test Runner for Backend
 * 
 * This script runs all test suites in the correct order:
 * 1. Unit tests (fast, isolated)
 * 2. Integration tests (medium speed, with database)
 * 3. Performance tests (slow, with large datasets)
 * 4. End-to-end tests (slowest, full system)
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';

interface TestSuite {
    name: string;
    pattern: string;
    timeout: number;
    description: string;
}

const testSuites: TestSuite[] = [
    {
        name: 'Unit Tests',
        pattern: '**/*.unit.test.ts',
        timeout: 30000,
        description: 'Fast isolated unit tests'
    },
    {
        name: 'Integration Tests',
        pattern: '**/*.integration.test.ts',
        timeout: 60000,
        description: 'Integration tests with database'
    },
    {
        name: 'Performance Tests',
        pattern: '**/*.performance.test.ts',
        timeout: 120000,
        description: 'Performance tests with large datasets'
    },
    {
        name: 'WebSocket Tests',
        pattern: '**/*websocket*.test.ts',
        timeout: 30000,
        description: 'WebSocket communication tests'
    },
    {
        name: 'Security Tests',
        pattern: '**/*security*.test.ts',
        timeout: 30000,
        description: 'Security and authentication tests'
    }
];

class TestRunner {
    private verbose: boolean;
    private failFast: boolean;
    private coverage: boolean;

    constructor(options: { verbose?: boolean; failFast?: boolean; coverage?: boolean } = {}) {
        this.verbose = options.verbose || false;
        this.failFast = options.failFast || false;
        this.coverage = options.coverage || false;
    }

    async runAllTests(): Promise<void> {
        console.log('🚀 Starting Comprehensive Test Suite\n');

        const results: { suite: string; passed: boolean; duration: number }[] = [];
        let totalDuration = 0;

        for (const suite of testSuites) {
            const startTime = Date.now();

            try {
                console.log(`📋 Running ${suite.name}...`);
                console.log(`   ${suite.description}`);

                await this.runTestSuite(suite);

                const duration = Date.now() - startTime;
                totalDuration += duration;

                results.push({ suite: suite.name, passed: true, duration });
                console.log(`✅ ${suite.name} passed (${duration}ms)\n`);

            } catch (error) {
                const duration = Date.now() - startTime;
                totalDuration += duration;

                results.push({ suite: suite.name, passed: false, duration });
                console.error(`❌ ${suite.name} failed (${duration}ms)`);

                if (this.verbose) {
                    console.error(error);
                }

                if (this.failFast) {
                    console.error('\n💥 Stopping due to test failure (fail-fast mode)');
                    process.exit(1);
                }
                console.log('');
            }
        }

        this.printSummary(results, totalDuration);
    }

    private async runTestSuite(suite: TestSuite): Promise<void> {
        const jestCommand = this.buildJestCommand(suite);

        if (this.verbose) {
            console.log(`   Command: ${jestCommand}`);
        }

        try {
            execSync(jestCommand, {
                stdio: this.verbose ? 'inherit' : 'pipe',
                timeout: suite.timeout,
                cwd: process.cwd()
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

        if (this.coverage) {
            options.push('--coverage');
        }

        if (!this.verbose) {
            options.push('--silent');
        }

        return `${baseCommand} ${options.join(' ')}`;
    }

    private printSummary(results: { suite: string; passed: boolean; duration: number }[], totalDuration: number): void {
        console.log('📊 Test Summary');
        console.log('================');

        const passed = results.filter(r => r.passed).length;
        const failed = results.filter(r => !r.passed).length;

        results.forEach(result => {
            const status = result.passed ? '✅' : '❌';
            const duration = `${result.duration}ms`;
            console.log(`${status} ${result.suite.padEnd(20)} ${duration.padStart(8)}`);
        });

        console.log('================');
        console.log(`Total: ${results.length} suites`);
        console.log(`Passed: ${passed}`);
        console.log(`Failed: ${failed}`);
        console.log(`Duration: ${totalDuration}ms`);

        if (failed > 0) {
            console.log('\n❌ Some tests failed!');
            process.exit(1);
        } else {
            console.log('\n🎉 All tests passed!');
        }
    }

    async runSpecificSuite(suiteName: string): Promise<void> {
        const suite = testSuites.find(s => s.name.toLowerCase().includes(suiteName.toLowerCase()));

        if (!suite) {
            console.error(`❌ Test suite "${suiteName}" not found`);
            console.log('Available suites:');
            testSuites.forEach(s => console.log(`  - ${s.name}`));
            process.exit(1);
        }

        console.log(`🚀 Running ${suite.name}...`);

        try {
            await this.runTestSuite(suite);
            console.log(`✅ ${suite.name} completed successfully`);
        } catch (error) {
            console.error(`❌ ${suite.name} failed`);
            if (this.verbose) {
                console.error(error);
            }
            process.exit(1);
        }
    }

    async checkTestEnvironment(): Promise<void> {
        console.log('🔍 Checking test environment...');

        // Check if database is available
        const dbConfigPath = path.join(process.cwd(), 'src', 'config', 'environment.ts');
        if (!existsSync(dbConfigPath)) {
            console.warn('⚠️  Database configuration not found');
        }

        // Check if test database is configured
        if (!process.env.NODE_ENV) {
            process.env.NODE_ENV = 'test';
        }

        console.log(`   Environment: ${process.env.NODE_ENV}`);
        console.log(`   Database: ${process.env.DB_NAME || 'default'}`);
        console.log('✅ Environment check complete\n');
    }
}

// CLI Interface
async function main() {
    const args = process.argv.slice(2);
    const options = {
        verbose: args.includes('--verbose') || args.includes('-v'),
        failFast: args.includes('--fail-fast') || args.includes('-f'),
        coverage: args.includes('--coverage') || args.includes('-c')
    };

    const runner = new TestRunner(options);

    // Check for specific suite
    const suiteArg = args.find(arg => !arg.startsWith('--') && !arg.startsWith('-'));

    try {
        await runner.checkTestEnvironment();

        if (suiteArg) {
            await runner.runSpecificSuite(suiteArg);
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

export { TestRunner };