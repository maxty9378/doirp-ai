@routes @smoke
Feature: Voice Service Playback
  As a user
  I want the voice service text to appear progressively during playback
  So that the current word is highlighted as the audio plays

  Background:
    Given the application is running

  @ROUTES-VOICE-001 @P0
  Scenario: Text appears progressively in the voice service player
    Given the voice service TTS is mocked
    When I navigate to "/voice-service"
    And I enter voice service text "Привет мир"
    And I start voice playback
    When I advance voice playback to 10 percent
    Then the voice service text should include "Привет"
    And the voice service text should not include "мир"
    And the word "Привет" should be highlighted
    When I advance voice playback to 90 percent
    Then the voice service text should include "мир"
    And the word "мир" should be highlighted
