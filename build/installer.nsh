; Personalizações do instalador (NSIS).
; Cria a pasta de livros vazia ao lado do executável e a preserva ao desinstalar.

!macro customInstall
  CreateDirectory "$INSTDIR\books"
!macroend

; Desinstalar/atualizar NÃO apaga os livros: remove tudo da pasta de instalação, menos "books".
!macro customRemoveFiles
  Push $R1
  Push $R2
  SetOutPath $TEMP
  FindFirst $R1 $R2 "$INSTDIR\*.*"
  dw_loop:
    StrCmp $R2 "" dw_done
    StrCmp $R2 "." dw_next
    StrCmp $R2 ".." dw_next
    StrCmp $R2 "books" dw_next
    IfFileExists "$INSTDIR\$R2\*.*" dw_isdir dw_isfile
  dw_isdir:
    RMDir /r "$INSTDIR\$R2"
    Goto dw_next
  dw_isfile:
    Delete "$INSTDIR\$R2"
  dw_next:
    FindNext $R1 $R2
    Goto dw_loop
  dw_done:
  FindClose $R1
  ; remove a pasta de instalação só se estiver vazia (se houver livros, ela permanece)
  RMDir "$INSTDIR"
  Pop $R2
  Pop $R1
!macroend
