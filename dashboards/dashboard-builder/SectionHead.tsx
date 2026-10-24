/**
 * © Copyright IBM Corp. 2022, 2026
 * SPDX-License-Identifier: Apache-2.0
 *
 * A settings section heading with optional help folded behind an (i) button, so long explanations do not push the
 * settings themselves down the panel.
 */

import React from 'react';
import { Information } from '@carbon/icons-react';

interface Props {
  title: string;
  /** First heading in a tab: no rule above it. */
  first?: boolean;
  /** Help shown when the (i) is pressed. */
  hint?: React.ReactNode;
}

export default function SectionHead({ title, first, hint }: Props) {
  const [open, setOpen] = React.useState(false);
  const hintId = React.useId();
  return (
    <>
      <h3 className={`db-section db-section--hint${first ? ' db-section--first' : ''}`}>
        <span>{title}</span>
        {hint && (
          <button type="button" className={`db-hintbtn${open ? ' db-hintbtn--on' : ''}`} aria-expanded={open} aria-controls={hintId} title={open ? 'Hide help' : 'What is this?'} aria-label={`About ${title}`} onClick={() => setOpen(o => !o)}>
            <Information size={16} />
          </button>
        )}
      </h3>
      {hint && open && <div id={hintId} className="db-hint">{hint}</div>}
    </>
  );
}
