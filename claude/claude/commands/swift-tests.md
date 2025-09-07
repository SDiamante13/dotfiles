Write comprehensive integration tests for this iOS application following these principles:
1. Test Real User Flows End-to-End

Test complete user journeys from UI interaction to data persistence
Verify multi-screen workflows (login → browse → select → purchase → confirm)
Test actual navigation stack changes and view controller lifecycles
Validate that data flows correctly through all layers (UI → Business Logic → Data)

2. Use Real Implementations

Networking: Point to a dedicated test server or use local test fixtures served by a lightweight HTTP server
Database: Use in-memory Core Data stores or temporary SQLite databases
File System: Use temporary directories that are cleaned up after each test
User Defaults: Create isolated UserDefaults suites for testing
Keychain: Use test-specific keychain access groups

3. Test Environment Setup
swift// Example: Configure test environment
- Create a TestAppDelegate that configures services for testing
- Use launch arguments/environment variables to identify test mode
- Set up test data before each test scenario
- Clean up all persistent state after each test
4. UI Testing Integration

Use XCUITest for user interaction simulation
Test actual view controller presentations and dismissals
Verify UI state changes result in correct data updates
Test gesture recognizers, animations, and transitions
Validate accessibility elements during flows

5. Async Testing Patterns

Use XCTestExpectations for async operations
Test real network timeouts and retry mechanisms
Verify proper loading states and error handling
Test concurrent operations and race conditions
Validate background task completion

6. Data Layer Integration

Test Core Data migrations with real schema changes
Verify cascade deletes and relationship integrity
Test data synchronization between local and remote sources
Validate cache invalidation and refresh mechanisms
Test offline mode and data persistence

7. Test Structure Template
swiftclass [FeatureName]IntegrationTests: XCTestCase {
    // Set up test environment with real dependencies
    // Test complete user scenarios
    // Verify data consistency across layers
    // Clean up all test data
}
8. Specific Test Scenarios to Cover

Authentication Flow: Login → Token Storage → API Calls → Logout
Data Sync: Create locally → Sync → Modify remotely → Conflict resolution
Offline/Online Transitions: Queue actions offline → Execute when online
Deep Linking: URL handling → Navigation → Correct screen with data
Push Notifications: Receive → Process → Update UI → Persist changes
Background Refresh: Trigger → Fetch data → Update database → Notify UI
Payment Flows: Select item → Process payment → Verify → Update inventory

9. Performance and Resource Testing

Measure actual response times for complete operations
Test memory usage during large data operations
Verify proper resource cleanup (timers, observers, subscriptions)
Test app state restoration after termination
Validate battery-intensive operation handling

10. Error Scenario Testing

Test real network failures at various points in flows
Verify data integrity when operations are interrupted
Test recovery from corrupt data states
Validate proper error propagation through app layers
Test edge cases with real constraints (storage full, no network)

11. Test Data Management

Create factory functions for generating test data
Use deterministic data for reproducible tests
Test with realistic data volumes (thousands of records)
Include edge cases in test data (empty strings, special characters)
Test localization with actual translated content

12. Assertion Patterns
swift// Verify UI state
XCTAssertTrue(app.buttons["Submit"].exists)

// Verify data persistence
let savedItems = try coreDataStack.fetch(Item.fetchRequest())
XCTAssertEqual(savedItems.count, expectedCount)

// Verify navigation state
XCTAssertEqual(navigationController.viewControllers.count, 3)

// Verify combined state
waitForExpectations { _ in
    XCTAssertEqual(viewModel.state, .loaded)
    XCTAssertEqual(database.recordCount, apiResponse.items.count)
}
13. Test Organization

Group tests by user-facing features, not technical layers
Name tests after the scenario being tested, not the methods called
Use descriptive test names: test_whenUserCompletePurchase_thenInventoryUpdatesAndReceiptStored()
Create shared setup utilities for common scenarios

14. Continuous Integration Considerations

Ensure tests can run on CI without simulator UI
Use headless mode where possible
Set reasonable timeouts for network operations
Parallelize test execution where data isolation allows
Generate screenshots/videos for failed UI tests

Remember: These tests will be slower than unit tests but provide confidence that the entire system works together correctly. Focus on critical user paths and high-risk integration points.

This prompt emphasizes testing real implementations and complete user flows while providing practical guidance for iOS-specific testing challenges. The integration tests will give you confidence that your app works correctly as a whole system.RetryClaude can make mistakes. Please double-check responses.Researchbeta Opus 4
