; Personalizações do instalador (NSIS) do Astra Writer.
; Acrescenta ao assistente uma página com as opções "área de trabalho" e "menu Iniciar".
; Os livros ficam em Documentos\Astra Writer, fora da pasta de instalação: desinstalar ou atualizar nunca os apaga.

!include nsDialogs.nsh
!include LogicLib.nsh

!ifndef BUILD_UNINSTALLER
  Var AwDesktopBox
  Var AwStartMenuBox
  Var AwDesktop
  Var AwStartMenu
!endif

!macro customPageAfterChangeDir
  Function AwShortcutsCreate
    ${If} $AwDesktop == ""
      StrCpy $AwDesktop ${BST_CHECKED}
    ${EndIf}
    ${If} $AwStartMenu == ""
      StrCpy $AwStartMenu ${BST_CHECKED}
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Atalhos" "Escolha onde criar os atalhos do Astra Writer."
    nsDialogs::Create 1018
    Pop $0
    ${NSD_CreateLabel} 0 0 100% 24u "Selecione os atalhos que o instalador deve criar:"
    Pop $0
    ${NSD_CreateCheckbox} 8u 32u 100% 12u "Adicionar um atalho à Área de Trabalho"
    Pop $AwDesktopBox
    ${If} $AwDesktop == ${BST_CHECKED}
      ${NSD_Check} $AwDesktopBox
    ${EndIf}
    ${NSD_CreateCheckbox} 8u 50u 100% 12u "Adicionar um atalho ao Menu Iniciar"
    Pop $AwStartMenuBox
    ${If} $AwStartMenu == ${BST_CHECKED}
      ${NSD_Check} $AwStartMenuBox
    ${EndIf}
    nsDialogs::Show
  FunctionEnd

  Function AwShortcutsLeave
    ${NSD_GetState} $AwDesktopBox $AwDesktop
    ${NSD_GetState} $AwStartMenuBox $AwStartMenu
  FunctionEnd

  Page custom AwShortcutsCreate AwShortcutsLeave
!macroend

!macro customInstall
  ; Numa atualização automática (silenciosa) os atalhos que o usuário já tem ou removeu ficam como estão
  ${ifNot} ${isUpdated}
    ${If} $AwDesktop != ${BST_UNCHECKED}
      CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${EndIf}
    ${If} $AwStartMenu != ${BST_UNCHECKED}
      CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" "" "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0
    ${EndIf}
  ${endIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
!macroend
