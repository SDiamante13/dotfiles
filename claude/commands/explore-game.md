---
description: Perform comprehensive exploratory testing on Three.js educational games using playwright-mcp
---

# Three.js Educational Game Exploratory Testing with Playwright-MCP

## Goal

**think harder about games**

You are tasked with performing comprehensive exploratory testing on a Three.js educational game using playwright-mcp.

Your goal is to identify gameplay, educational, performance, and safety deficiencies through systematic exploration of interactive 3D learning experiences.

## Setup Instructions

1. Launch playwright-mcp server
2. Create a sub-task for all playwright operations to manage context window efficiently
3. Use the playwright-mcp tools exclusively through this sub-task approach
4. Ensure WebGL support is enabled in test browser
5. Set appropriate viewport sizes for target devices (tablets/desktops common for educational games)

## Authentication Handling

**IMPORTANT**: If you encounter login pages, student accounts, teacher dashboards, or parental controls:
- **STOP** testing immediately
- Document what you've found so far
- Ask the user to provide necessary credentials (student/teacher accounts, parent codes, etc.)
- Wait for credentials before proceeding with authenticated areas
- Once provided, test both public demo areas and authenticated learning environments

## Game Testing Methodology

Perform exploratory testing using these game-specific techniques:

### Core Game Testing Areas

- **🎮 Gameplay Mechanics**: Core interactions, controls responsiveness, game physics
- **🎯 Educational Flow**: Learning objectives → activities → assessment → feedback loop
- **⚡ Performance & Rendering**: Frame rates, WebGL stability, asset loading
- **🧒 Child Safety & COPPA**: Age-appropriate content, data collection, external links
- **🎵 Audio/Visual Systems**: Sound effects, music, visual feedback, accessibility
- **💾 Progress Persistence**: Save games, achievements, settings, cross-session continuity
- **📱 Device Compatibility**: Touch controls, mobile performance, orientation changes
- **🌐 Cross-Browser Support**: WebGL compatibility across browsers
- **♿ Learning Accessibility**: Multiple learning styles, difficulty settings, assistive technology

### Game-Specific Testing Approach

1. **Initial Game Load**
    - Test scene initialization and asset loading
    - Verify WebGL context creation
    - Check for loading screens and progress indicators
    - Monitor console for Three.js/WebGL errors

2. **Educational Content Validation**
    - **STOP and request credentials** if student accounts required
    - Verify learning objectives are clearly presented
    - Test educational activities for accuracy and age-appropriateness
    - Validate feedback mechanisms (correct/incorrect responses)
    - Check progress tracking and achievement systems

3. **Gameplay Interaction Testing**
    - Test mouse/keyboard controls on desktop
    - Validate touch controls on mobile/tablet
    - Check camera controls (orbit, zoom, pan if applicable)
    - Test object selection and manipulation in 3D space
    - Verify collision detection and physics interactions

4. **Performance Stress Testing**
    - Monitor frame rate during complex scenes
    - Test with multiple 3D objects/particles active
    - Check memory usage over extended play sessions
    - Validate graceful degradation on lower-end devices

5. **Error Recovery & Edge Cases**
    - Test WebGL context loss recovery
    - Validate behavior with audio disabled
    - Check offline/poor connection scenarios
    - Test browser tab switching and focus loss

6. **Child Safety Compliance**
    - Verify no external links without parent permission
    - Check data collection practices (minimal for kids)
    - Validate content appropriateness for target age
    - Test parental controls if present

## Game Issue Classification

**🔴 CRITICAL (Red X)**:
- Game won't start or frequent crashes
- WebGL context failures with no fallback
- Educational content errors or inappropriate material
- Student progress/data loss
- Performance below 20fps on target devices
- Child safety violations (inappropriate content, unauthorized data collection)
- Accessibility barriers preventing learning

**⚠️ WARNING (Yellow Warning)**:
- Inconsistent frame rates (20-45fps)
- Unclear educational instructions or feedback
- Poor touch controls or input responsiveness
- Minor audio/visual sync issues
- Weak progress tracking
- Performance concerns on older devices
- Suboptimal learning flow

**✅ PASSED (Green Checkmark)**:
- Smooth gameplay at 45+ fps
- Clear educational objectives and feedback
- Responsive controls across input methods
- Proper save/load functionality
- Age-appropriate content and interactions
- Good accessibility support
- Effective learning progression

## Canvas & WebGL Testing Utilities

### Coordinate-Based Interaction Testing
```javascript
// Test canvas clicks at specific 3D object locations
await page.mouse.click(canvasX, canvasY);

// Test game controls
await page.keyboard.press('ArrowUp');
await page.keyboard.press('Space');

// Test touch gestures (mobile)
await page.touchscreen.tap(touchX, touchY);
```

### Performance Monitoring
```javascript
// Monitor frame rate
const fps = await page.evaluate(() => window.game?.getFrameRate());

// Check WebGL context
const webglSupport = await page.evaluate(() => {
  const canvas = document.createElement('canvas');
  return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
});

// Memory usage tracking
const memoryUsage = await page.evaluate(() => performance.memory?.usedJSHeapSize);
```

### Educational Progress Testing
```javascript
// Test level completion
await page.evaluate(() => window.game?.completeLevel(levelId));

// Check learning objective completion
const objectivesMet = await page.evaluate(() => window.game?.getCompletedObjectives());

// Validate save game state
await page.evaluate(() => window.game?.saveProgress());
```

## Report Requirements

Create a comprehensive markdown report saved as `threejs_game_testing_report_YYYY-MM-DD_HH-MM-SS.md` with:

### Structure:
1. **🔴 CRITICAL GAME ISSUES** (at top for visibility)
2. **⚠️ PERFORMANCE & UX WARNINGS**
3. **✅ PASSED EDUCATIONAL FEATURES**
4. **🎮 GAMEPLAY MECHANICS STATUS**
5. **🧒 CHILD SAFETY COMPLIANCE**
6. **📱 DEVICE COMPATIBILITY MATRIX**
7. **🎯 EDUCATIONAL EFFECTIVENESS**
8. **AUTHENTICATION STATUS** (what was tested with/without student accounts)
9. **EXECUTIVE SUMMARY** (2-3 readable paragraphs focusing on learning experience)
10. **RECOMMENDED ACTION PLAN** (prioritized for educational impact)

### Game-Specific Content Guidelines:
- Include frame rate measurements and performance metrics
- Capture screenshots of 3D scenes and UI elements
- Document control schemes tested (mouse/keyboard/touch)
- Note WebGL capabilities and browser compatibility
- Clearly distinguish between demo vs authenticated student experience
- Evaluate educational effectiveness alongside technical functionality
- Assess age-appropriateness of content and interactions
- Include device performance matrix (desktop/tablet/mobile)

## Child Safety Checklist

- [ ] No external links without clear parental permission
- [ ] Minimal data collection (name, progress only)
- [ ] Age-appropriate content throughout
- [ ] No chat or social features with strangers
- [ ] Clear privacy policy and COPPA compliance
- [ ] Parental controls accessible and functional
- [ ] No in-game purchases or ads inappropriate for children

## Performance Benchmarks

**Target Frame Rates:**
- Desktop: 60fps minimum, 45fps acceptable
- Tablet: 45fps minimum, 30fps acceptable
- Mobile: 30fps minimum, 20fps degraded experience

**Loading Time Targets:**
- Initial game load: < 10 seconds
- Level transitions: < 3 seconds
- Asset streaming: Seamless background loading

## Execution Notes

- Start with basic WebGL capability detection
- Test core educational loop before advanced features
- **Always stop and ask for credentials when student accounts encountered**
- Pay special attention to touch controls for tablet-based learning
- Monitor both educational effectiveness and technical performance
- Document any Three.js version or WebGL compatibility issues
- Test with volume on/off (classroom environments)
- Consider slow internet connections (school networks)

Ready to test your Three.js educational game! Please provide:
1. Game URL
2. Target age group
3. Primary learning objectives
4. Any known student/teacher account requirements