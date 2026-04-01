export const sampleDialogueSource = `@id village_guide_intro
@title Village Guide Intro
@scene oak_square
@meta ambience=morning_market
@tag onboarding, village

:start
Guide [mood=warm portrait=guide_smile]: First time in Oak Square? Keep your coin purse close.
? Ask about the courier board -> courier_board [tags=quest]
? Ask where to rest -> inn
? Leave politely -> goodbye

:courier_board
Guide [mood=helpful]: The board near the fountain lists work for travelers.
@set learned_courier_board=true
? Head to the board -> goodbye [set=tracked_board:true]
? Ask about rewards -> rewards

:rewards
Guide [mood=proud]: Honest work pays in coin, favors, and the occasional secret.
-> goodbye

:inn
Guide [portrait=guide_think]: The Lantern Inn stays open as long as the lamps are burning.
? Thanks -> goodbye

:goodbye
Guide [mood=calm]: Good luck out there.
END
`;
