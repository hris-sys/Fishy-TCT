import type { SpeciesConfig } from '../tank'
import { anglerfish } from './anglerfish/config'
import { clownfish } from './clownfish/config'
import { goldfish } from './goldfish/config'
import { pufferfish } from './pufferfish/config'
import { shark } from './shark/config'

/** Every species, in picker order. A new species is an art folder plus one config file added here. */
export const species: SpeciesConfig[] = [goldfish, clownfish, pufferfish, shark, anglerfish]
