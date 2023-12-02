'use-strict';

let isPresenter = false;

// ####################################################
// SHOW HIDE DESIRED BUTTONS BY RULES
// ####################################################

const isRulesActive = true;

const BUTTONS = {
    main: {
        shareButton: false,
        hideMeButton: false,
        startAudioButton: true,
        startVideoButton: true,
        startScreenButton: false,
        swapCameraButton: true,
        chatButton: false,
        participantsButton: false,
        whiteboardButton: false,
        settingsButton: false,
        aboutButton: false, // Please keep me always visible, thank you!
        exitButton: false,
    },
    settings: {
        lockRoomButton: true,
        unlockRoomButton: true,
        lobbyButton: true,
        tabRecording: true,
    },
    producerVideo: {
        videoPictureInPicture: false,
        fullScreenButton: false,
        snapShotButton: false,
        muteAudioButton: false,
        videoPrivacyButton: false,
    },
    consumerVideo: {
        videoPictureInPicture: false,
        fullScreenButton: false,
        snapShotButton: false,
        sendMessageButton: false,
        sendFileButton: false,
        sendVideoButton: false,
        muteVideoButton: false,
        muteAudioButton: false,
        audioVolumeInput: false,
        ejectButton: false,
    },
    videoOff: {
        sendMessageButton: false,
        sendFileButton: false,
        sendVideoButton: false,
        muteAudioButton: false,
        audioVolumeInput: false,
        ejectButton: false,
    },
    chat: {
        chatMaxButton: true,
        chatSaveButton: true,
        chatEmojiButton: true,
        chatMarkdownButton: true,
        chatGPTButton: true,
        chatShareFileButton: true,
        chatSpeechStartButton: true,
    },
    participantsList: {
        saveInfoButton: false,
    },
    whiteboard: {
        whiteboardLockButton: false,
    },
    //...
};

function handleRules(isPresenter) {
    console.log('06.1 ----> IsPresenter: ' + isPresenter);
    if (!isRulesActive) return;
    if (!isPresenter) {
        BUTTONS.participantsList.saveInfoButton = false;
        BUTTONS.settings.lockRoomButton = false;
        BUTTONS.settings.unlockRoomButton = false;
        BUTTONS.settings.lobbyButton = false;
        BUTTONS.videoOff.muteAudioButton = false;
        BUTTONS.videoOff.ejectButton = false;
        BUTTONS.consumerVideo.ejectButton = false;
        BUTTONS.consumerVideo.muteAudioButton = false;
        BUTTONS.consumerVideo.muteVideoButton = false;
        BUTTONS.whiteboard.whiteboardLockButton = false;
        //...
    } else {
        BUTTONS.participantsList.saveInfoButton = false;
        BUTTONS.settings.lockRoomButton = !isRoomLocked;
        BUTTONS.settings.unlockRoomButton = isRoomLocked;
        BUTTONS.settings.lobbyButton = false;
        BUTTONS.videoOff.muteAudioButton = false;
        BUTTONS.videoOff.ejectButton = false;
        BUTTONS.consumerVideo.ejectButton = false;
        BUTTONS.consumerVideo.muteAudioButton = false;
        BUTTONS.consumerVideo.muteVideoButton = false;
        BUTTONS.whiteboard.whiteboardLockButton = false;
        //...
    }
    // main. settings...
    BUTTONS.settings.lockRoomButton ? show(lockRoomButton) : hide(lockRoomButton);
    BUTTONS.settings.unlockRoomButton ? show(unlockRoomButton) : hide(unlockRoomButton);
    BUTTONS.settings.lobbyButton ? show(lobbyButton) : hide(lobbyButton);
    BUTTONS.participantsList.saveInfoButton ? show(participantsSaveBtn) : hide(participantsSaveBtn);
    BUTTONS.whiteboard.whiteboardLockButton
        ? elemDisplay(whiteboardLockButton, false)
        : elemDisplay(whiteboardLockButton, false, 'flex');
    //...
}
